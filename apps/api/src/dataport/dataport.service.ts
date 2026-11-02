import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ZipArchive } from 'archiver';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { CHANNELS, IMPORT_FIELDS, STAGES, normaliseTitle, toAnnualPence, type Channel, type ImportField, type Stage } from '@jobsmith/shared';
import { config } from '../config.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import { RedisService } from '../redis.service.js';
import { QueueService } from '../jobs/queue.service.js';
import { FilesService } from '../files/files.service.js';
import { CompaniesService } from '../companies/companies.service.js';
import { ReminderPlanner } from '../reminders/reminder-planner.js';
import { PdfJobsService } from '../cv/pdf-jobs.service.js';

export const MAX_IMPORT_ROWS = 2000;

/** Column headings people use in their old spreadsheets, for the suggested mapping. */
const GUESS: Record<ImportField, RegExp> = {
  title: /^(job ?)?(title|role|position)$/i,
  company: /^(company|employer|organi[sz]ation)( name)?$/i,
  location: /^(location|city|place)$/i,
  url: /^(url|link|job (url|link)|advert)$/i,
  stage: /^(stage|status)$/i,
  appliedOn: /^(applied|date applied|applied (on|date)|application date)$/i,
  closingDate: /^(closing|closing date|deadline|closes)$/i,
  salaryMin: /^(salary|salary (min|from)|min salary|pay)$/i,
  salaryMax: /^(salary (max|to)|max salary)$/i,
  channel: /^(channel|source|via|applied (via|through))$/i,
  notes: /^(notes?|comments?)$/i,
};

const STAGE_WORDS: [RegExp, Stage][] = [
  [/offer/i, 'OFFER'],
  [/reject|declin|unsuccessful|no$/i, 'REJECTED'],
  [/withdr/i, 'WITHDRAWN'],
  [/interview|onsite|technical|final/i, 'INTERVIEW'],
  [/screen|phone|recruiter call/i, 'SCREENING'],
  [/appl|sent|submitted/i, 'APPLIED'],
];
const CHANNEL_WORDS: [RegExp, Channel][] = [
  [/linked ?in/i, 'LINKEDIN'],
  [/recruit|agency/i, 'RECRUITER'],
  [/referr/i, 'REFERRAL'],
  [/indeed|reed|totaljobs|glassdoor|board|cwjobs|otta/i, 'JOB_BOARD'],
  [/e-?mail/i, 'EMAIL'],
  [/site|career|website|direct/i, 'COMPANY_SITE'],
];

function parseDate(v: string): string | null {
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  // UK order: 02/11/2026 is 2 November.
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    const iso = `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  }
  return null;
}

function parseMoney(v: string): number | null {
  const s = v.replace(/[£€$,\s]/g, '').toLowerCase();
  const m = /^(\d+(?:\.\d+)?)(k)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  return n > 0 && n < 10_000_000 ? toAnnualPence(n, 'YEAR') : null;
}

function readCsv(csv: string): string[][] {
  try {
    return parse(csv, { bom: true, relax_column_count: true, skip_empty_lines: true, trim: true }) as string[][];
  } catch {
    throw new BadRequestException({ message: 'That file couldn’t be read as CSV. Export it from your spreadsheet as “CSV (comma separated)”.', field: 'csv' });
  }
}

/** A cell that starts with = + - @ is prefixed so spreadsheets never run it as a formula (CSV injection). */
const safeCell = (v: unknown) => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

@Injectable()
export class DataportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
    private readonly files: FilesService,
    private readonly companies: CompaniesService,
    private readonly reminders: ReminderPlanner,
    private readonly pdf: PdfJobsService,
  ) {}

  // ---------- Import ----------

  preview(csv: string) {
    const rows = readCsv(csv);
    if (rows.length < 2) throw new BadRequestException({ message: 'The file needs a heading row and at least one job.', field: 'csv' });
    const headers = rows[0]!.map((h) => h.trim());
    const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, headers.findIndex((h) => GUESS[f].test(h))]).map(([f, i]) => [f, (i as number) >= 0 ? i : null]));
    return { headers, sample: rows.slice(1, 6), rowCount: Math.min(rows.length - 1, MAX_IMPORT_ROWS), tooMany: rows.length - 1 > MAX_IMPORT_ROWS, mapping };
  }

  async requestImport(userId: string, csv: string, mapping: Partial<Record<ImportField, number | null>>) {
    this.preview(csv);
    const job = await this.prisma.dataJob.create({ data: { userId, kind: 'IMPORT', input: { csv, mapping } as Prisma.InputJsonValue } });
    await this.queue.add('work', 'import', { id: job.id });
    return this.pdf.toDto(job);
  }

  /** Worker: creates applications row by row; bad rows are skipped with a reason, never half-saved. */
  async processImport(id: string) {
    const job = await this.prisma.dataJob.findUnique({ where: { id } });
    if (!job || job.status !== 'PENDING') return;
    const { csv, mapping } = job.input as { csv: string; mapping: Partial<Record<ImportField, number | null>> };
    const rows = readCsv(csv).slice(1, MAX_IMPORT_ROWS + 1);
    const cell = (r: string[], f: ImportField) => (mapping[f] != null ? (r[mapping[f]!] ?? '').trim() : '');
    let created = 0;
    const errors: { row: number; reason: string }[] = [];
    for (const [i, r] of rows.entries()) {
      const title = cell(r, 'title').slice(0, 200);
      const company = cell(r, 'company').slice(0, 200);
      if (!title || !company) {
        errors.push({ row: i + 2, reason: 'No job title or company' });
        continue;
      }
      const stageText = cell(r, 'stage');
      const stage: Stage = STAGES.find((s) => s === stageText.toUpperCase()) ?? STAGE_WORDS.find(([re]) => re.test(stageText))?.[1] ?? 'SAVED';
      const channelText = cell(r, 'channel');
      const channel: Channel | null = CHANNELS.find((c) => c === channelText.toUpperCase()) ?? CHANNEL_WORDS.find(([re]) => re.test(channelText))?.[1] ?? null;
      const appliedOn = parseDate(cell(r, 'appliedOn'));
      const closing = parseDate(cell(r, 'closingDate'));
      const url = cell(r, 'url');
      try {
        await this.prisma.$transaction(async (tx) => {
          const c = await this.companies.findOrCreate(job.userId, company, tx);
          const appliedAt = appliedOn ? new Date(`${appliedOn}T12:00:00Z`) : stage !== 'SAVED' ? job.createdAt : null;
          const app = await tx.application.create({
            data: {
              userId: job.userId,
              companyId: c.id,
              title,
              normalizedTitle: normaliseTitle(title),
              location: cell(r, 'location').slice(0, 200) || null,
              url: /^https?:\/\//i.test(url) ? url.slice(0, 2000) : null,
              stage,
              channel,
              appliedAt,
              firstReplyAt: ['SCREENING', 'INTERVIEW', 'OFFER'].includes(stage) ? appliedAt : null,
              closingDate: closing ? new Date(`${closing}T00:00:00Z`) : null,
              salaryMinPence: parseMoney(cell(r, 'salaryMin')),
              salaryMaxPence: parseMoney(cell(r, 'salaryMax')),
              notes: cell(r, 'notes').slice(0, 20_000) || null,
              source: 'IMPORT',
              stageChangedAt: appliedAt ?? job.createdAt,
            },
          });
          await tx.stageEvent.create({ data: { userId: job.userId, applicationId: app.id, to: stage, at: appliedAt ?? job.createdAt } });
          await this.reminders.planForApplication(tx, app.id);
        });
        created++;
      } catch {
        errors.push({ row: i + 2, reason: 'Could not be saved' });
      }
    }
    await this.prisma.dataJob.update({ where: { id }, data: { status: 'DONE', input: { mapping } as Prisma.InputJsonValue, result: { created, skipped: errors.length, errors: errors.slice(0, 50) } } });
    await this.redis.invalidate(job.userId);
  }

  // ---------- Export ----------

  async requestExport(userId: string) {
    const job = await this.prisma.dataJob.create({ data: { userId, kind: 'EXPORT' } });
    await this.queue.add('work', 'export', { id: job.id });
    return this.pdf.toDto(job);
  }

  /** Worker: everything the user owns as JSON and CSV, plus every PDF, in one zip. Kept for 24 hours. */
  async processExport(id: string) {
    const job = await this.prisma.dataJob.findUnique({ where: { id } });
    if (!job || job.status !== 'PENDING') return;
    const userId = job.userId;
    try {
      const [user, profile, items, versions, companies, applications, contacts, interviews, letters, reminders, stored] = await Promise.all([
        this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { name: true, email: true, homeCity: true, timeZone: true, workAuthNotes: true, targetRoles: true, targetLocations: true, styleNote: true, weeklyTarget: true, followUpDays: true, createdAt: true },
        }),
        this.prisma.profile.findUnique({ where: { userId }, select: { fullName: true, email: true, phone: true, location: true, headline: true, summary: true } }),
        this.prisma.profileItem.findMany({ where: { userId }, select: { id: true, kind: true, data: true, sortOrder: true, bullets: { select: { id: true, text: true, sortOrder: true } } } }),
        this.prisma.cvVersion.findMany({ where: { userId }, select: { id: true, name: true, headline: true, summary: true, template: true, selection: true, createdAt: true } }),
        this.prisma.company.findMany({ where: { userId }, select: { id: true, name: true, website: true, notes: true, sponsorName: true } }),
        this.prisma.application.findMany({
          where: { userId },
          include: {
            company: { select: { name: true } },
            stageEvents: { select: { from: true, to: true, at: true } },
            drafts: { select: { kind: true, body: true, updatedAt: true } },
            snapshots: { select: { id: true, kind: true, label: true, content: true, createdAt: true, fileId: true } },
          },
        }),
        this.prisma.contact.findMany({ where: { userId }, include: { company: { select: { name: true } }, logs: { select: { direction: true, channel: true, at: true, note: true, applicationId: true } }, applications: { select: { applicationId: true } } } }),
        this.prisma.interview.findMany({ where: { userId }, include: { application: { select: { title: true, company: { select: { name: true } } } } } }),
        this.prisma.letterTemplate.findMany({ where: { userId }, select: { name: true, body: true } }),
        this.prisma.reminder.findMany({ where: { userId }, select: { kind: true, title: true, dueAt: true, sentAt: true, dismissedAt: true, applicationId: true } }),
        this.prisma.storedFile.findMany({ where: { userId, kind: { in: ['CV_PDF', 'LETTER_PDF'] }, snapshot: { isNot: null } } }),
      ]);
      const data = {
        exportedAt: new Date().toISOString(),
        format: 'jobsmith-export-v1',
        account: user,
        profile: { contact: profile, items },
        cvVersions: versions,
        companies,
        applications: applications.map(({ userId: _u, companyId: _c, normalizedTitle: _n, ...a }) => a),
        contacts: contacts.map(({ userId: _u, ...c }) => c),
        interviews: interviews.map(({ userId: _u, ...i }) => i),
        letterTemplates: letters,
        reminders,
      };
      const csv = (rows: Record<string, unknown>[]) => stringify(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safeCell(v)]))), { header: true, columns: rows[0] ? Object.keys(rows[0]) : ['empty'] });
      const zip = new ZipArchive({ zlib: { level: 6 } });
      const out = new PassThrough();
      const chunks: Buffer[] = [];
      out.on('data', (c: Buffer) => chunks.push(c));
      const done = new Promise<void>((resolve, reject) => {
        out.on('end', resolve);
        zip.on('error', reject);
      });
      zip.pipe(out);
      zip.append(JSON.stringify(data, null, 2), { name: 'jobsmith.json' });
      zip.append(
        csv(applications.map((a) => ({ title: a.title, company: a.company.name, stage: a.stage, channel: a.channel ?? '', location: a.location ?? '', url: a.url ?? '', appliedOn: a.appliedAt?.toISOString().slice(0, 10) ?? '', firstReplyOn: a.firstReplyAt?.toISOString().slice(0, 10) ?? '', closingDate: a.closingDate?.toISOString().slice(0, 10) ?? '', salaryMin: a.salaryMinPence ? a.salaryMinPence / 100 : '', salaryMax: a.salaryMaxPence ? a.salaryMaxPence / 100 : '', currency: a.currency, archived: a.archivedAt ? 'yes' : '', notes: a.notes ?? '' }))),
        { name: 'applications.csv' },
      );
      zip.append(csv(contacts.map((c) => ({ name: c.name, type: c.type, role: c.role ?? '', company: c.company?.name ?? '', email: c.email ?? '', linkedin: c.linkedinUrl ?? '', notes: c.notes ?? '' }))), { name: 'contacts.csv' });
      zip.append(csv(interviews.map((i) => ({ application: `${i.application.title} at ${i.application.company.name}`, type: i.type, startsAt: i.startsAt?.toISOString() ?? '', dueAt: i.dueAt?.toISOString() ?? '', interviewers: i.interviewers ?? '', prepNotes: i.prepNotes ?? '', reflections: i.reflections ?? '' }))), { name: 'interviews.csv' });
      for (const f of stored) {
        const buf = await readFile(path.resolve(config().STORAGE_DIR, f.path)).catch(() => null);
        if (buf) zip.append(buf, { name: `pdfs/${f.id.slice(-8)}-${f.name.replace(/[^\w.-]+/g, '-')}` });
      }
      await zip.finalize();
      await done;
      const file = await this.files.save(userId, 'EXPORT', `jobsmith-export-${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip', Buffer.concat(chunks), this.prisma, new Date(Date.now() + 86_400_000));
      await this.prisma.dataJob.update({ where: { id }, data: { status: 'DONE', fileId: file.id } });
    } catch {
      await this.prisma.dataJob.update({ where: { id }, data: { status: 'FAILED', error: 'The export couldn’t be made. Please try again.' } });
    }
  }

  async latest(userId: string, kind: 'EXPORT' | 'IMPORT') {
    const job = await this.prisma.dataJob.findFirst({ where: { userId, kind }, orderBy: { createdAt: 'desc' } });
    if (!job) throw new NotFoundException({ message: 'Nothing yet.' });
    return this.pdf.toDto(job);
  }

  /** Worker, hourly: expired downloads (exports, one-off PDFs) are deleted. */
  async cleanup() {
    const expired = await this.prisma.storedFile.findMany({ where: { expiresAt: { lt: new Date() } }, select: { id: true } });
    for (const f of expired) await this.files.remove(f.id);
    return { removed: expired.length };
  }
}
