import { z } from 'zod';
import { AI_PROVIDERS, AGENT_STEPS, RUN_STATUSES, STEP_STATUSES, type AgentStepName, type AiProviderName } from './enums.js';
import type { KeywordResult } from './keywords.js';
import type { SalaryCheck } from './salary.js';
import type { SponsorBadge } from './types.js';

/**
 * The application agent: seven typed steps. Every step output is validated against these schemas before
 * it is saved (project rules: agent runs). AI outputs that don't validate are retried once, then shown as an error.
 */

// ---------- AI settings (bring your own key) ----------

export const aiSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().trim().max(120).nullish().transform((v) => v || null),
  baseUrl: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v == null || /^https?:\/\/[^\s]+$/i.test(v), 'Enter a full URL, for example http://localhost:11434/v1'),
  /** Write-only. Omitted or empty: keep the saved key. */
  apiKey: z.string().trim().max(500).optional(),
  removeKey: z.boolean().optional(),
  monthlyLimit: z.number().int().min(1).max(100_000).nullish().transform((v) => v ?? null),
});

export interface AiSettingsDto {
  provider: AiProviderName;
  model: string | null;
  baseUrl: string | null;
  hasKey: boolean;
  /** Only the last 4 characters of the key ever leave the server. */
  keyLast4: string | null;
  monthlyLimit: number | null;
  defaults: Record<AiProviderName, string>;
  usage: { month: string; requests: number; tokensIn: number; tokensOut: number };
  /** Local endpoints (Ollama on this machine) need AI_ALLOW_LOCAL_ENDPOINTS=true on the server. */
  localEndpointsAllowed: boolean;
}

// ---------- Step outputs ----------

const shortList = z.array(z.string().trim().min(1).max(80)).max(25);

export const readJobOutput = z.object({
  role: z.string().trim().min(1).max(200),
  seniority: z.enum(['GRADUATE', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'UNKNOWN']),
  mustHave: shortList,
  niceToHave: shortList,
  salary: z.string().trim().max(200).nullable(),
  location: z.string().trim().max(200).nullable(),
  closingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  summary: z.string().trim().max(600),
  source: z.enum(['AI', 'SAVED_FIELDS']),
});
export type ReadJobOutput = z.infer<typeof readJobOutput>;

export const sponsorCheckOutput = z.object({
  status: z.enum(['LICENSED', 'POSSIBLE', 'NOT_FOUND', 'UNKNOWN']),
  sponsorName: z.string().nullable(),
  routes: z.array(z.string()),
  town: z.string().nullable(),
  rating: z.string().nullable(),
  note: z.string(),
});

export const salaryCheckOutput = z.object({ check: z.custom<SalaryCheck | null>((v) => v === null || (typeof v === 'object' && v !== null && 'message' in v)) });

export const pickCvOutput = z.object({
  cvVersionId: z.uuid().nullable(),
  cvVersionName: z.string().nullable(),
  score: z.number().int().min(0).max(100),
  ranking: z.array(z.object({ id: z.uuid(), name: z.string(), score: z.number().int().min(0).max(100) })),
  covered: z.array(z.string()),
  missing: z.array(z.string()),
  explanation: z.string().max(700).nullable(),
});

/** Phrases a Jobsmith letter or message must never contain (PRD section 5, writing style). */
export const BANNED_PHRASES = [
  'i am writing to express',
  'writing to express my',
  'keen interest',
  'passionate',
  'dynamic',
  'i believe i would be a great fit',
  'perfect fit',
  'team player',
  'go-getter',
  'synergy',
  'thrilled',
  'excited to apply',
  'esteemed',
  'look no further',
  'i am confident that',
  'proven track record',
  'hit the ground running',
  'fast-paced environment',
] as const;

export function findBannedPhrases(text: string): string[] {
  const t = text.toLowerCase();
  return BANNED_PHRASES.filter((p) => t.includes(p));
}

const noCliches = (field: string) => (v: string) => findBannedPhrases(v).length === 0 || `The ${field} uses clichés.`;

export const coverLetterOutput = z.object({
  letter: z
    .string()
    .trim()
    .min(200, 'The letter is too short.')
    .max(3500, 'The letter is too long.')
    .superRefine((v, ctx) => {
      const r = noCliches('letter')(v);
      if (r !== true) ctx.addIssue({ code: 'custom', message: r });
    }),
});

export const messageOutput = z.object({
  recipient: z.enum(['HIRING_MANAGER', 'RECRUITER']),
  message: z
    .string()
    .trim()
    .min(40)
    .max(700)
    .superRefine((v, ctx) => {
      const r = noCliches('message')(v);
      if (r !== true) ctx.addIssue({ code: 'custom', message: r });
    }),
});

export const followUpOutput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string() });

export const keywordExplainOutput = z.object({ explanation: z.string().trim().min(20).max(700) });

export const extractJobOutput = z.object({
  title: z.string().trim().max(200).nullable(),
  company: z.string().trim().max(200).nullable(),
  location: z.string().trim().max(200).nullable(),
  workMode: z.enum(['ONSITE', 'HYBRID', 'REMOTE']).nullable(),
  salaryMin: z.number().nonnegative().nullable(),
  salaryMax: z.number().nonnegative().nullable(),
  salaryPeriod: z.enum(['YEAR', 'MONTH', 'WEEK', 'DAY', 'HOUR']).nullable(),
  currency: z.string().length(3).nullable(),
  closingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  description: z.string().max(60_000).nullable(),
});

export const STEP_SCHEMAS = {
  READ_JOB: readJobOutput,
  SPONSOR_CHECK: sponsorCheckOutput,
  SALARY_CHECK: salaryCheckOutput,
  PICK_CV: pickCvOutput,
  COVER_LETTER: coverLetterOutput,
  MESSAGE: messageOutput,
  FOLLOW_UP: followUpOutput,
} satisfies Record<AgentStepName, z.ZodType>;

/** Steps that need an AI key. The others are deterministic and never call the AI. */
export const AI_STEPS: AgentStepName[] = ['READ_JOB', 'COVER_LETTER', 'MESSAGE'];

export interface AgentStepDto {
  index: number;
  name: AgentStepName;
  status: (typeof STEP_STATUSES)[number];
  output: unknown;
  error: string | null;
  tokensIn: number;
  tokensOut: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AgentRunDto {
  id: string;
  applicationId: string;
  application: { title: string; company: string };
  status: (typeof RUN_STATUSES)[number];
  promptVersion: string;
  replay: boolean;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  savedAt: string | null;
  createdAt: string;
  steps: AgentStepDto[];
}

export const agentSaveSchema = z.object({
  coverLetter: z.string().trim().max(10_000).nullish(),
  message: z.string().trim().max(2_000).nullish(),
  followUpOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export const stepParam = z.object({ id: z.uuid('Not found.'), index: z.coerce.number().int().min(0).max(AGENT_STEPS.length - 1) });

export type SponsorCheckStep = SponsorBadge & { note: string };
export type PickCvStep = z.infer<typeof pickCvOutput> & { keywords?: KeywordResult[] };
