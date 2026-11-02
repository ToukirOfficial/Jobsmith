import { toAnnualPence, type JobDraft, type WorkMode } from '@jobsmith/shared';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£', euro: '€', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', bull: '•' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML to readable plain text: block elements become line breaks, list items get a dash. Never runs scripts. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style|noscript|template|svg|iframe|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|section|article|tr|header|footer)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1]!.trim()));
    } catch {
      // Broken JSON-LD on a page is common; skip that block.
    }
  }
  return out;
}

function findJobPosting(node: unknown, depth = 0): Json | null {
  if (depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (!isObj(node)) return null;
  const type = node['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return node;
  if (node['@graph']) return findJobPosting(node['@graph'], depth + 1);
  return null;
}

function location(job: Json): string | null {
  const locs = Array.isArray(job['jobLocation']) ? job['jobLocation'] : job['jobLocation'] ? [job['jobLocation']] : [];
  const names = locs
    .map((l) => {
      if (!isObj(l)) return str(l);
      const a = l['address'];
      if (isObj(a)) return [str(a['addressLocality']), str(a['addressRegion'])].filter(Boolean).join(', ') || str(a['addressCountry']);
      return str(a) ?? str(l['name']);
    })
    .filter((x): x is string => !!x);
  return [...new Set(names)].join('; ') || null;
}

function workMode(job: Json, text: string): WorkMode | null {
  if (String(job['jobLocationType'] ?? '').toUpperCase().includes('TELECOMMUTE')) return 'REMOTE';
  if (/\bhybrid\b/i.test(text)) return 'HYBRID';
  if (/\bfully remote\b|\bremote[- ]first\b/i.test(text)) return 'REMOTE';
  return null;
}

const PERIODS: Record<string, 'YEAR' | 'MONTH' | 'WEEK' | 'DAY' | 'HOUR'> = { YEAR: 'YEAR', MONTH: 'MONTH', WEEK: 'WEEK', DAY: 'DAY', HOUR: 'HOUR' };

function salary(job: Json): { min: number | null; max: number | null; currency: string | null } {
  const base = job['baseSalary'] ?? job['estimatedSalary'];
  const b = Array.isArray(base) ? base[0] : base;
  if (!isObj(b)) return { min: null, max: null, currency: null };
  const currency = str(b['currency'])?.toUpperCase() ?? null;
  const v = b['value'];
  const num = (x: unknown) => {
    const n = typeof x === 'number' ? x : typeof x === 'string' ? Number(x.replace(/[^0-9.]/g, '')) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  let min: number | null;
  let max: number | null;
  let unit: string;
  if (isObj(v)) {
    min = num(v['minValue']) ?? num(v['value']);
    max = num(v['maxValue']) ?? num(v['value']);
    unit = String(v['unitText'] ?? b['unitText'] ?? 'YEAR').toUpperCase();
  } else {
    min = max = num(v);
    unit = String(b['unitText'] ?? 'YEAR').toUpperCase();
  }
  const period = PERIODS[unit] ?? 'YEAR';
  return { min: min ? toAnnualPence(min, period) : null, max: max ? toAnnualPence(max, period) : null, currency };
}

function date(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1]! : null;
}

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  const m = re.exec(html) ?? re2.exec(html);
  return m ? decodeEntities(m[1]!).trim() || null : null;
}

/** schema.org JobPosting (JSON-LD) only. Returns null when the page has none. */
export function extractJobPosting(html: string, url: string | null = null): JobDraft | null {
  let job: Json | null = null;
  for (const block of jsonLdBlocks(html)) {
    job = findJobPosting(block);
    if (job) break;
  }
  if (!job) return null;
  const org = job['hiringOrganization'];
  const description = str(job['description']);
  const descText = description ? htmlToText(decodeEntities(description)) : null;
  const pay = salary(job);
  return {
    title: str(job['title']) ? decodeEntities(str(job['title'])!) : null,
    company: isObj(org) ? str(org['name']) : str(org),
    location: location(job),
    workMode: workMode(job, `${descText ?? ''} ${str(job['title']) ?? ''}`),
    salaryMinPence: pay.min,
    salaryMaxPence: pay.max,
    currency: pay.currency,
    closingDate: date(job['validThrough']),
    description: descText ? descText.slice(0, 60_000) : null,
    url,
    method: 'JSON_LD',
  };
}

/** No structured data: the page title and readable text, for the user (or the AI) to work from. */
export function pageTextDraft(html: string, url: string | null): JobDraft {
  const title = metaContent(html, 'og:title') ?? (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ? decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)![1]!).trim() : null);
  const main = /<main[\s\S]*?<\/main>/i.exec(html)?.[0] ?? /<article[\s\S]*?<\/article>/i.exec(html)?.[0] ?? html;
  const company = metaContent(html, 'og:site_name');
  return {
    title,
    company,
    location: null,
    workMode: null,
    salaryMinPence: null,
    salaryMaxPence: null,
    currency: null,
    closingDate: null,
    description: htmlToText(main).slice(0, 60_000) || null,
    url,
    method: 'PAGE_TEXT',
  };
}
