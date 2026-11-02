/**
 * Manual evaluation run (README in evals/). Uses the app's own prompt files and step schemas with the
 * caller's own key from the environment. Never part of the automated tests.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { AI_PROVIDERS, coverLetterOutput, findBannedPhrases, messageOutput, readJobOutput, type AiProviderName } from '@jobsmith/shared';
import type { z } from 'zod';
import { complete, parseJsonObject, type AiTarget } from './ai/providers.js';
import { PROMPT_VERSION, renderPrompt, type PromptName } from './ai/prompts.js';

interface Case {
  id: string;
  title: string;
  company: string;
  hiringManager: string | null;
  mustHave: string[];
  forbidden: string[];
  jobText: string;
}
const dir = new URL('../../../evals/cases/', import.meta.url);
const candidate = JSON.parse(readFileSync(new URL('candidate.json', dir), 'utf8')) as { name: string; styleNote: string; facts: string[]; profile: string };
const cases = readdirSync(dir)
  .filter((f) => /^\d+-.*\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as Case);

const provider = (process.env['EVAL_PROVIDER'] ?? 'GEMINI').toUpperCase() as AiProviderName;
const defaults: Record<AiProviderName, string> = { GEMINI: process.env['AI_MODEL_GEMINI'] ?? 'gemini-2.5-flash', OPENAI: process.env['AI_MODEL_OPENAI'] ?? 'gpt-5-mini', ANTHROPIC: process.env['AI_MODEL_ANTHROPIC'] ?? 'claude-haiku-5-5', OPENAI_COMPATIBLE: '' };
if (!AI_PROVIDERS.includes(provider)) throw new Error(`EVAL_PROVIDER must be one of ${AI_PROVIDERS.join(', ')}`);
const target: AiTarget = { provider, apiKey: process.env['EVAL_API_KEY'] ?? '', model: process.env['EVAL_MODEL'] ?? defaults[provider], baseUrl: process.env['EVAL_BASE_URL'] ?? null };
if (!target.apiKey && provider !== 'OPENAI_COMPATIBLE') {
  console.error('Set EVAL_API_KEY (your own key). See evals/README.md.');
  process.exit(2);
}

async function ask<S extends z.ZodType>(name: PromptName, values: Record<string, string>, schema: S) {
  const p = renderPrompt(name, values);
  const res = await complete(target, { ...p, json: true, maxTokens: 1500 });
  const parsed = schema.safeParse(parseJsonObject(res.text));
  return { raw: res.text, parsed };
}

const rows: { case: string; check: string; ok: boolean; note?: string }[] = [];
const check = (c: string, name: string, ok: boolean, note?: string) => rows.push({ case: c, check: name, ok, note });

console.log(`Prompts ${PROMPT_VERSION}, ${provider} ${target.model}, ${cases.length} cases\n`);
for (const k of cases) {
  const read = await ask('read-job', { today: new Date().toISOString().slice(0, 10), title: k.title, company: k.company, jobText: k.jobText }, readJobOutput.omit({ source: true }));
  check(k.id, 'read-job: valid JSON and schema', read.parsed.success, read.parsed.success ? undefined : read.parsed.error.issues[0]?.message);
  if (read.parsed.success) {
    const found = read.parsed.data.mustHave.join(' ').toLowerCase();
    const missing = k.mustHave.filter((m) => !found.includes(m.toLowerCase()));
    check(k.id, 'read-job: finds the must-haves', missing.length === 0, missing.length ? `missed ${missing.join(', ')}` : undefined);
  }

  const values = { name: candidate.name, styleNote: candidate.styleNote, profile: candidate.profile, role: k.title, company: k.company, hiringManager: k.hiringManager ?? 'Hiring Manager', mustHave: k.mustHave.join(', ') || 'not listed', jobText: k.jobText };
  const letter = await ask('cover-letter', values, coverLetterOutput);
  const text = letter.parsed.success ? letter.parsed.data.letter : letter.raw;
  check(k.id, 'letter: valid JSON and schema (length, no clichés)', letter.parsed.success, letter.parsed.success ? undefined : letter.parsed.error.issues[0]?.message);
  check(k.id, 'letter: no banned phrases', findBannedPhrases(text).length === 0, findBannedPhrases(text).join(', ') || undefined);
  check(k.id, 'letter: names the company', text.includes(k.company));
  check(k.id, 'letter: uses a real fact from the profile', candidate.facts.some((f) => text.includes(f)));
  const bad = k.forbidden.filter((f) => text.toLowerCase().includes(f.toLowerCase()));
  check(k.id, 'letter: nothing invented or injected', bad.length === 0, bad.join(', ') || undefined);
  check(k.id, 'letter: no exclamation marks', !text.includes('!'));

  const msg = await ask('message', { ...values, recipient: 'HIRING_MANAGER', recipientLabel: 'hiring manager', recipientName: k.hiringManager ?? 'unknown' }, messageOutput);
  const m = msg.parsed.success ? msg.parsed.data.message : msg.raw;
  check(k.id, 'message: valid JSON and schema', msg.parsed.success, msg.parsed.success ? undefined : msg.parsed.error.issues[0]?.message);
  const badM = k.forbidden.filter((f) => m.toLowerCase().includes(f.toLowerCase()));
  check(k.id, 'message: nothing invented or injected', badM.length === 0, badM.join(', ') || undefined);
}

const failed = rows.filter((r) => !r.ok);
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.case.padEnd(24)} ${r.check}${r.note ? `  (${r.note})` : ''}`);
console.log(`\n${rows.length - failed.length}/${rows.length} checks passed`);
process.exit(failed.length ? 1 : 0);
