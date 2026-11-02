import { z } from 'zod';

const bool = (def: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.url().default('http://localhost:8035'),
    API_PORT: z.coerce.number().int().default(8135),
    API_HOST: z.string().default('127.0.0.1'),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().default('redis://127.0.0.1:6379/5'),
    REDIS_PREFIX: z.string().regex(/^[a-z0-9-]+$/).default('jobsmith'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    /** 32 bytes, base64 or hex: encrypts users' AI keys (AES-256-GCM). Losing it makes saved keys unreadable. */
    ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be 32 bytes (base64 or hex)'),
    COOKIE_SECURE: bool('true'),
    SIGNUP_ENABLED: bool('false'),
    DEMO_MODE: bool('false'),
    MAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
    MAIL_FROM: z.string().default('Jobsmith <no-reply@example.com>'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_SECURE: bool('false'),
    /** auto: a login code only when SMTP is set up (ASSUMPTIONS.md). always: tests. */
    LOGIN_CODES: z.enum(['auto', 'always', 'never']).default('auto'),
    STORAGE_DIR: z.string().default('./storage'),
    /** Default AI models, overridable per user in Settings → AI. */
    AI_MODEL_GEMINI: z.string().default('gemini-2.5-flash'),
    AI_MODEL_OPENAI: z.string().default('gpt-5-mini'),
    AI_MODEL_ANTHROPIC: z.string().default('claude-haiku-5-5'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(60_000),
    /** Sponsor register source (GOV.UK Content API). */
    SPONSOR_REGISTER_URL: z.url().default('https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers'),
  })
  .refine((c) => c.NODE_ENV !== 'production' || c.COOKIE_SECURE, {
    path: ['COOKIE_SECURE'],
    message: 'COOKIE_SECURE must be true in production',
  })
  .refine((c) => c.MAIL_TRANSPORT !== 'smtp' || !!c.SMTP_HOST, {
    path: ['SMTP_HOST'],
    message: 'SMTP_HOST is needed when MAIL_TRANSPORT=smtp',
  })
  .transform((c) => ({
    ...c,
    // The demo never sends email and never opens sign-up.
    SIGNUP_ENABLED: c.DEMO_MODE ? false : c.SIGNUP_ENABLED,
    MAIL_ENABLED: c.MAIL_TRANSPORT === 'smtp' && !c.DEMO_MODE,
  }));

export type Config = z.infer<typeof envSchema>;

let cached: Config | undefined;

export function config(): Config {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new Error(`Invalid environment:\n${issues.join('\n')}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Tests change env between files. */
export function resetConfig() {
  cached = undefined;
}

/** Whether a login needs the emailed code (ASSUMPTIONS.md: only when the server can send email). */
export function loginCodesOn(): boolean {
  const c = config();
  if (c.LOGIN_CODES === 'always') return true;
  if (c.LOGIN_CODES === 'never') return false;
  return c.MAIL_ENABLED;
}
