import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import { normaliseCompany } from '@jobsmith/shared';
import { config } from '../config.js';
import { PrismaService } from '../prisma.service.js';
import { SponsorLookupService } from './sponsor-lookup.service.js';

/**
 * Keeps a local copy of the Home Office "Register of licensed sponsors: workers". The approach is ported
 * from github.com/ToukirOfficial/uk-sponsors (MIT): ask the GOV.UK Content API where today's CSV is,
 * download it only from GOV.UK's asset host, stream-parse it, check the columns by name, and swap the
 * whole table in one transaction so badges never see a half-loaded register.
 */
export const REQUIRED_COLUMNS = { name: 'Organisation Name', town: 'Town/City', county: 'County', rating: 'Type & Rating', route: 'Route' } as const;
const ALLOWED_ORIGINS = ['https://assets.publishing.service.gov.uk'];

export class RegisterError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
// eslint-disable-next-line no-control-regex -- removing control characters is the point
const clean = (v: string | undefined) => (v ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
const headerKey = (h: string) => h.replace(/^\uFEFF/, '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Finds the CSV attachment in the Content API JSON and checks it comes from GOV.UK's file host. */
export function locateCsv(data: unknown): { url: string; publishedAt: Date | null } {
  if (!isObj(data) || !isObj(data['details']) || !Array.isArray(data['details']['attachments'])) throw new RegisterError('GOV.UK publication data has changed: no attachments.');
  const csv = (data['details']['attachments'] as unknown[]).find((a): a is Record<string, unknown> => isObj(a) && a['content_type'] === 'text/csv' && typeof a['url'] === 'string');
  if (!csv) throw new RegisterError('GOV.UK publication data has changed: no CSV attachment.');
  let url: URL;
  try {
    url = new URL(String(csv['url']));
  } catch {
    throw new RegisterError('The register CSV link is not a valid URL.');
  }
  if (!ALLOWED_ORIGINS.includes(url.origin)) throw new RegisterError(`Refusing to download the register from ${url.origin}.`);
  const updated = typeof data['public_updated_at'] === 'string' ? new Date(data['public_updated_at']) : null;
  return { url: url.href, publishedAt: updated && !Number.isNaN(updated.getTime()) ? updated : null };
}

export interface RegisterRow {
  name: string;
  normalizedName: string;
  town: string | null;
  county: string | null;
  rating: string | null;
  route: string;
}

/** Stream-parses the register CSV. Extra columns are fine; a missing one stops the import with its name. */
export async function readRegister(input: Readable): Promise<RegisterRow[]> {
  const parser = input.pipe(parse({ bom: true, relax_column_count: true, skip_empty_lines: true }));
  input.on('error', (e) => parser.destroy(e));
  type Cols = Record<keyof typeof REQUIRED_COLUMNS, number>;
  let cols: Cols | null = null;
  const rows: RegisterRow[] = [];
  for await (const record of parser as AsyncIterable<string[]>) {
    if (!cols) {
      const pos = new Map(record.map((h, i) => [headerKey(h), i] as const));
      const missing = Object.values(REQUIRED_COLUMNS).filter((label) => !pos.has(headerKey(label)));
      if (missing.length) throw new RegisterError(`The register's columns have changed. Missing: ${missing.join(', ')}.`);
      cols = Object.fromEntries(Object.entries(REQUIRED_COLUMNS).map(([k, label]) => [k, pos.get(headerKey(label))!])) as Cols;
      continue;
    }
    const name = clean(record[cols.name]);
    if (!name) continue;
    rows.push({
      name,
      normalizedName: normaliseCompany(name),
      town: clean(record[cols.town]) || null,
      county: clean(record[cols.county]) || null,
      rating: clean(record[cols.rating]) || null,
      route: clean(record[cols.route]) || 'Unknown route',
    });
  }
  if (!cols) throw new RegisterError('The register CSV was empty.');
  return rows;
}

@Injectable()
export class SponsorRegisterService {
  private readonly logger = new Logger('SponsorRegister');
  /** Tests only: replaces the network. */
  static fetcher: typeof fetch = (...args) => fetch(...args);
  /** A real register has well over 100,000 rows; far fewer means the file is wrong. */
  static minRows = 10_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: SponsorLookupService,
  ) {}

  /** Daily job. Downloads only when GOV.UK has published a new file. */
  async update(): Promise<{ status: 'unchanged' | 'updated' | 'failed'; rows?: number }> {
    const job = await this.prisma.sponsorImport.create({ data: { sourceUrl: config().SPONSOR_REGISTER_URL } });
    try {
      const meta = await SponsorRegisterService.fetcher(config().SPONSOR_REGISTER_URL, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
      if (!meta.ok) throw new RegisterError(`GOV.UK answered ${meta.status}.`);
      const source = locateCsv(await meta.json());
      const last = await this.prisma.sponsorImport.findFirst({ where: { status: 'DONE' }, orderBy: { createdAt: 'desc' } });
      if (last?.sourceUrl === source.url) {
        await this.prisma.sponsorImport.delete({ where: { id: job.id } });
        return { status: 'unchanged' };
      }
      const csv = await SponsorRegisterService.fetcher(source.url, { signal: AbortSignal.timeout(180_000) });
      if (!csv.ok || !csv.body) throw new RegisterError(`The register download answered ${csv.status}.`);
      const rows = await readRegister(Readable.fromWeb(csv.body as import('node:stream/web').ReadableStream));
      if (rows.length < SponsorRegisterService.minRows) throw new RegisterError(`The register has only ${rows.length} rows, so it was not loaded.`);
      await this.prisma.$transaction(
        async (tx) => {
          await tx.sponsor.deleteMany({});
          for (let i = 0; i < rows.length; i += 5000) await tx.sponsor.createMany({ data: rows.slice(i, i + 5000) });
          await tx.sponsorImport.update({ where: { id: job.id }, data: { status: 'DONE', sourceUrl: source.url, publishedAt: source.publishedAt, rowCount: rows.length } });
        },
        { timeout: 300_000 },
      );
      await this.lookup.clearLoadedCache();
      this.logger.log(`Sponsor register loaded: ${rows.length} rows`);
      return { status: 'updated', rows: rows.length };
    } catch (e) {
      const message = e instanceof RegisterError ? e.message : 'The register could not be downloaded.';
      this.logger.warn(`Sponsor register update failed: ${message}`);
      await this.prisma.sponsorImport.update({ where: { id: job.id }, data: { status: 'FAILED', error: message } });
      return { status: 'failed' };
    }
  }
}
