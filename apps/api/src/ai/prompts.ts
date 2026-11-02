import { readFileSync } from 'node:fs';

/** The prompt set in use. Evals in evals/ run the same files. */
export const PROMPT_VERSION = 'v1';
export type PromptName = 'read-job' | 'cover-letter' | 'message' | 'explain-match' | 'extract-job';

const cache = new Map<string, { system: string; user: string }>();

/** prompts/<version>/<name>.md at the repository root. */
export function loadPrompt(name: PromptName, version = PROMPT_VERSION) {
  const key = `${version}/${name}`;
  let p = cache.get(key);
  if (!p) {
    const text = readFileSync(new URL(`../../../../prompts/${version}/${name}.md`, import.meta.url), 'utf8');
    const m = /## System\s*\n([\s\S]*?)\n## User\s*\n([\s\S]*)$/.exec(text);
    if (!m) throw new Error(`Prompt ${key} needs "## System" and "## User" sections`);
    p = { system: m[1]!.trim(), user: m[2]!.trim() };
    cache.set(key, p);
  }
  return p;
}

/**
 * Untrusted text (job pages) can't close the wrapper tag or open a new one: any tag that looks like ours
 * is defanged, and the text is cut to a sane length.
 */
export function untrusted(text: string | null | undefined, max = 24_000): string {
  return (text ?? '')
    .slice(0, max)
    .replace(/<\s*\/?\s*untrusted_job_posting\s*>/gi, '[tag removed]')
    .replace(/<\s*\/?\s*(system|assistant|user|instructions?)\s*>/gi, '[tag removed]');
}

/** Fills {{placeholders}}. Values for keys listed in `untrustedKeys` are passed through untrusted(). */
export function renderPrompt(name: PromptName, values: Record<string, string | number | null | undefined>, untrustedKeys: string[] = ['jobText', 'summary', 'title', 'company', 'url']) {
  const p = loadPrompt(name);
  const fill = (t: string) =>
    t.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
      const v = values[k];
      const s = v == null || v === '' ? 'none' : String(v);
      return untrustedKeys.includes(k) ? untrusted(s) : s;
    });
  return { system: fill(p.system), user: fill(p.user) };
}
