import { z } from 'zod';
import { CURRENCIES } from './money.js';
import {
  CHANNELS,
  CONTACT_TYPES,
  INTERVIEW_TYPES,
  JOB_SOURCES,
  LOG_CHANNELS,
  LOG_DIRECTIONS,
  STAGES,
  WORK_MODES,
} from './enums.js';

/**
 * Every request body, query and param is validated with these schemas, in the browser for quick feedback
 * and again in NestJS. z.object strips unknown fields.
 */
const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`);
const required = (max: number, what = 'This') => z.string().trim().min(1, `${what} is required.`).max(max, `Keep this under ${max} characters.`);
const optionalText = (max: number) => text(max).optional().transform((v) => (v ? v : null));
const nullableText = (max: number) => text(max).nullish().transform((v) => (v ? v : null));
export const emailField = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')).pipe(z.string().max(254));
export const passwordField = z.string().min(10, 'Use at least 10 characters.').max(200, 'Keep this under 200 characters.');
const url = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), 'Enter a full link starting with https://')
  .pipe(z.url('Enter a valid link.'));
const nullableUrl = z.union([url, z.literal('').transform(() => null), z.null()]).optional().transform((v) => v ?? null);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-02.');
const nullableDate = z.union([isoDate, z.literal('').transform(() => null), z.null()]).optional().transform((v) => v ?? null);
const isoDateTime = z.iso.datetime({ offset: true, message: 'Enter a valid date and time.' });
const pence = z.number().int().min(0).max(100_000_000_00);

export const idParam = z.object({ id: z.uuid('Not found.') });
export const tokenParam = z.object({ token: z.string().min(10).max(200) });

// ---------- Auth ----------

export const setupSchema = z.object({ name: required(100, 'Your name'), email: emailField, password: passwordField });
export const signupSchema = setupSchema;
export const loginSchema = z.object({ email: emailField, password: z.string().min(1, 'Enter your password.').max(200) });
export const verifyCodeSchema = z.object({ challenge: z.string().min(10).max(2000), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.') });
export const resendCodeSchema = z.object({ challenge: z.string().min(10).max(2000) });
export const resetRequestSchema = z.object({ email: emailField });
export const resetConfirmSchema = z.object({ token: z.string().min(20).max(200), password: passwordField });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1, 'Enter your current password.').max(200), password: passwordField });
export const deleteAccountSchema = z.object({ password: z.string().min(1, 'Enter your password.').max(200) });

// ---------- Settings ----------

export const settingsSchema = z.object({
  name: required(100, 'Your name'),
  homeCity: optionalText(100),
  timeZone: z.string().trim().min(1).max(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid time zone.'),
  workAuthNotes: optionalText(500),
  targetRoles: z.array(required(80)).max(20).default([]),
  targetLocations: z.array(required(80)).max(20).default([]),
  styleNote: optionalText(1000),
  weeklyTarget: z.number().int().min(0).max(100),
  followUpDays: z.number().int().min(1).max(60),
  emailReminders: z.boolean(),
});

// ---------- Applications ----------

export const applicationSchema = z
  .object({
    title: required(200, 'Job title'),
    company: required(200, 'Company'),
    url: nullableUrl,
    location: nullableText(200),
    workMode: z.enum(WORK_MODES).nullish().transform((v) => v ?? null),
    salaryMinPence: pence.nullish().transform((v) => v ?? null),
    salaryMaxPence: pence.nullish().transform((v) => v ?? null),
    currency: z.enum(CURRENCIES).default('GBP'),
    closingDate: nullableDate,
    description: nullableText(60_000),
    notes: nullableText(20_000),
    source: z.enum(JOB_SOURCES).default('MANUAL'),
    stage: z.enum(STAGES).default('SAVED'),
  })
  .refine((v) => v.salaryMinPence == null || v.salaryMaxPence == null || v.salaryMinPence <= v.salaryMaxPence, {
    path: ['salaryMaxPence'],
    message: 'The top of the range must be at least the bottom.',
  });
export const applicationUpdateSchema = z.object({
  title: required(200, 'Job title').optional(),
  company: required(200, 'Company').optional(),
  url: nullableUrl,
  location: nullableText(200),
  workMode: z.enum(WORK_MODES).nullish(),
  salaryMinPence: pence.nullish(),
  salaryMaxPence: pence.nullish(),
  currency: z.enum(CURRENCIES).optional(),
  closingDate: nullableDate,
  description: nullableText(60_000),
  notes: nullableText(20_000),
  channel: z.enum(CHANNELS).nullish(),
});
export const stageChangeSchema = z.object({ stage: z.enum(STAGES), position: z.number().int().min(0).max(100_000).optional() });
export const applySchema = z.object({
  channel: z.enum(CHANNELS),
  appliedOn: isoDate.optional(),
  cvVersionId: z.uuid().nullish(),
  attachCoverLetter: z.boolean().default(true),
});
export const archiveSchema = z.object({ archived: z.boolean() });
export const duplicateQuery = z.object({ company: required(200), title: required(200), excludeId: z.uuid().optional() });

const csvList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : []))
    .pipe(z.array(z.enum(values)).max(values.length));

export const applicationListQuery = z.object({
  q: text(200).optional(),
  stage: csvList(STAGES),
  company: z.uuid().optional(),
  sponsor: z.enum(['yes', 'no', 'unknown']).optional(),
  location: text(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  archived: z.enum(['true', 'false', 'all']).default('false'),
  sort: z.enum(['updated', 'created', 'company', 'title', 'stage', 'closing', 'applied']).default('updated'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

// ---------- Companies ----------

export const companyUpdateSchema = z.object({
  name: required(200, 'Company name').optional(),
  website: nullableUrl,
  notes: nullableText(20_000),
  /** Confirms a "possible match" from the sponsor register (or clears it with null). */
  sponsorName: text(300).nullish(),
});

// ---------- Contacts ----------

export const contactSchema = z.object({
  name: required(120, 'Name'),
  type: z.enum(CONTACT_TYPES),
  companyId: z.uuid().nullish().transform((v) => v ?? null),
  role: nullableText(120),
  email: z.union([emailField, z.literal('').transform(() => null), z.null()]).optional().transform((v) => v ?? null),
  linkedinUrl: nullableUrl,
  notes: nullableText(10_000),
  applicationIds: z.array(z.uuid()).max(50).optional(),
});
export const contactLogSchema = z.object({
  direction: z.enum(LOG_DIRECTIONS),
  channel: z.enum(LOG_CHANNELS),
  at: isoDateTime,
  note: required(5000, 'A short note'),
  applicationId: z.uuid().nullish().transform((v) => v ?? null),
});
export const linkContactSchema = z.object({ contactId: z.uuid() });

// ---------- Interviews ----------

export const interviewSchema = z
  .object({
    applicationId: z.uuid(),
    type: z.enum(INTERVIEW_TYPES),
    startsAt: isoDateTime.nullish().transform((v) => v ?? null),
    dueAt: isoDateTime.nullish().transform((v) => v ?? null),
    durationMins: z.number().int().min(5).max(600).nullish().transform((v) => v ?? null),
    interviewers: nullableText(500),
    location: nullableText(500),
    prepNotes: nullableText(20_000),
    reflections: nullableText(20_000),
    completed: z.boolean().default(false),
  })
  .refine((v) => (v.type === 'TAKE_HOME' ? !!v.dueAt : !!v.startsAt), {
    path: ['startsAt'],
    message: 'Add the date and time (or the deadline for a take-home task).',
  });
export const interviewUpdateSchema = z.object({
  type: z.enum(INTERVIEW_TYPES).optional(),
  startsAt: isoDateTime.nullish(),
  dueAt: isoDateTime.nullish(),
  durationMins: z.number().int().min(5).max(600).nullish(),
  interviewers: nullableText(500),
  location: nullableText(500),
  prepNotes: nullableText(20_000),
  reflections: nullableText(20_000),
  completed: z.boolean().optional(),
});

export type SetupInput = z.infer<typeof setupSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type ApplicationInput = z.input<typeof applicationSchema>;
export type ContactInput = z.input<typeof contactSchema>;
export type InterviewInput = z.input<typeof interviewSchema>;

// ---------- Saving a job by link ----------

export const jobFetchSchema = z.object({ url: z.string().trim().min(1, 'Paste a job link.').max(2000) });

// ---------- Letters, drafts, insights, reminders ----------

export const letterTemplateSchema = z.object({ name: required(80, 'Template name'), body: required(10_000, 'The letter') });
export const draftKindParam = z.object({ id: z.uuid('Not found.'), kind: z.enum(['COVER_LETTER', 'LINKEDIN_NOTE', 'FOLLOW_UP_EMAIL']) });
export const draftSchema = z.object({ body: text(10_000) });
export const fromTemplateSchema = z.object({ templateId: z.uuid() });
export const insightsQuery = z.object({ cvVersionId: z.uuid().optional() });
export const reminderListQuery = z.object({ scope: z.enum(['due', 'upcoming', 'all']).default('all') });
export const reminderUpdateSchema = z.object({ dismissed: z.boolean() });
export const calendarQuery = z.object({ from: isoDate, to: isoDate });

// ---------- Import ----------

export const IMPORT_FIELDS = ['title', 'company', 'location', 'url', 'stage', 'appliedOn', 'closingDate', 'salaryMin', 'salaryMax', 'channel', 'notes'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export const importPreviewSchema = z.object({ csv: z.string().min(1, 'Choose a CSV file.').max(3_000_000, 'That file is too large (3 MB at most).') });
export const importSchema = importPreviewSchema.extend({
  /** CSV column index for each Jobsmith field, or null to skip it. */
  mapping: z.record(z.enum(IMPORT_FIELDS), z.number().int().min(0).max(200).nullable()).refine((m) => m.title != null && m.company != null, 'Choose the columns for the job title and the company.'),
});
