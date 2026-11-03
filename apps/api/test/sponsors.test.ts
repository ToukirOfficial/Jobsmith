import { readFileSync } from 'node:fs';
import { PassThrough, Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REGISTER_BATCH_SIZE, SponsorRegisterService, locateCsv, readRegister, readRegisterBatches } from '../src/sponsors/sponsor-register.service.js';
import { as, createUser, startApp, type Client, type TestContext } from './helpers.js';

const csv = readFileSync(new URL('./fixtures/register.csv', import.meta.url), 'utf8');
const CSV_URL = 'https://assets.publishing.service.gov.uk/media/abc/2026-11-02_-_Worker_and_Temporary_Worker.csv';
const contentApi = (url = CSV_URL) => ({ public_updated_at: '2026-11-02T09:00:00Z', details: { attachments: [{ content_type: 'text/html', url: 'https://www.gov.uk/x' }, { content_type: 'text/csv', url }] } });

let ctx: TestContext;
let c: Client;
let downloads = 0;

beforeAll(async () => {
  ctx = await startApp();
  c = await as(ctx, (await createUser(ctx.prisma)).id);
  SponsorRegisterService.minRows = 1;
  SponsorRegisterService.fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/api/content/')) return new Response(JSON.stringify(contentApi()), { headers: { 'content-type': 'application/json' } });
    if (url === CSV_URL) {
      downloads++;
      return new Response(csv, { headers: { 'content-type': 'text/csv' } });
    }
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
});
afterAll(async () => ctx.app.close());

describe('register parsing', () => {
  it('finds the CSV only on GOV.UK’s asset host', () => {
    expect(locateCsv(contentApi()).url).toBe(CSV_URL);
    expect(() => locateCsv(contentApi('https://evil.example/register.csv'))).toThrow(/Refusing/);
    expect(() => locateCsv({ details: { attachments: [] } })).toThrow(/no CSV/);
  });

  it('reads rows with a BOM, quoted fields and normalised names', async () => {
    const rows = await readRegister(Readable.from([csv]));
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ name: 'Brightwave Software Ltd', normalizedName: 'brightwave software', town: 'Manchester', route: 'Skilled Worker' });
    expect(rows[3]!.normalizedName).toBe('smith and jones');
  });

  it('stops with a clear message when a column is missing', async () => {
    await expect(readRegister(Readable.from(['Organisation Name,Town/City,Route\nA,B,C\n']))).rejects.toThrow(/Missing: County, Type & Rating/);
  });
});

describe('register batching', () => {
  // A large fake register built by repeating the fixture's rows (no real data).
  const [header, ...lines] = csv.split(/\r?\n/).filter(Boolean);
  const fake = (rows: number) => [header, ...Array.from({ length: rows }, (_, i) => lines[i % lines.length])].join('\n') + '\n';

  it('yields the register in batches of 1,000 rows', async () => {
    expect(REGISTER_BATCH_SIZE).toBe(1000);
    const sizes: number[] = [];
    for await (const batch of readRegisterBatches(Readable.from([fake(2500)]))) sizes.push(batch.length);
    expect(sizes).toEqual([1000, 1000, 500]);
  });

  it('hands over each batch before the rest of the file has arrived', async () => {
    const download = new PassThrough();
    const batches = readRegisterBatches(download)[Symbol.asyncIterator]();
    // 1,000 rows plus the start of the next one, as a download would arrive.
    const next = `${lines[0]}\n`;
    download.write(fake(1000) + next.slice(0, 10));
    const first = await batches.next();
    expect(first.value).toHaveLength(1000);
    expect(download.writableEnded).toBe(false);
    download.end(next.slice(10));
    expect((await batches.next()).value).toHaveLength(1);
    expect((await batches.next()).done).toBe(true);
  });
});

describe('sponsor matching', () => {
  it('shows UNKNOWN before the register is loaded', async () => {
    const a = await c.post('/applications', { title: 'Developer', company: 'Brightwave Software Limited' });
    expect(a.body.sponsor.status).toBe('UNKNOWN');
  });

  it('loads the register once, then skips an unchanged file', async () => {
    const svc = ctx.app.get(SponsorRegisterService);
    expect(await svc.update()).toEqual({ status: 'updated', rows: 5 });
    expect(await svc.update()).toEqual({ status: 'unchanged' });
    expect(downloads).toBe(1);
  });

  it('matches name variants and lists every route, with "licensed to sponsor" data only', async () => {
    const list = (await c.get('/applications?q=developer')).body.items;
    expect(list[0].sponsor).toMatchObject({ status: 'LICENSED', sponsorName: 'Brightwave Software Ltd', town: 'Manchester' });
    expect(list[0].sponsor.routes).toEqual(['Global Business Mobility: Senior or Specialist Worker', 'Skilled Worker']);
    const kestrel = await c.post('/applications', { title: 'Engineer', company: 'KESTREL SYSTEMS LTD' });
    expect(kestrel.body.sponsor.status).toBe('LICENSED');
    const sj = await c.post('/applications', { title: 'Engineer', company: 'Smith and Jones' });
    expect(sj.body.sponsor.status).toBe('LICENSED');
  });

  it('suggests close names, and the user can confirm one', async () => {
    const a = await c.post('/applications', { title: 'Analyst', company: 'Northgate Analytic' });
    expect(a.body.sponsor.status).toBe('NOT_FOUND');
    const company = await c.get(`/companies/${a.body.company.id}`);
    expect(company.body.possibleSponsors[0].name).toBe('Northgate Analytics Ltd');
    const confirmed = await c.patch(`/companies/${a.body.company.id}`, { sponsorName: 'Northgate Analytics Ltd' });
    expect(confirmed.body.sponsor.status).toBe('LICENSED');
    expect(confirmed.body.sponsor.routes).toEqual(['Skilled Worker']);
  });

  it('filters applications by sponsor status', async () => {
    const yes = (await c.get('/applications?sponsor=yes')).body.items.map((i: { company: { name: string } }) => i.company.name);
    expect(yes).toContain('Brightwave Software Limited');
    expect((await c.get('/applications?sponsor=no')).body.items.every((i: { sponsor: { status: string } }) => i.sponsor.status !== 'LICENSED')).toBe(true);
  });
});
