import { z } from 'zod';
import { CV_TEMPLATES, PROFILE_KINDS, type CvTemplate, type ProfileKind } from './enums.js';

/**
 * The CV builder: the profile is stored once as structured items with bullets; a CV version picks and
 * orders items and bullets. buildCvDocument turns both into one render model that the browser preview
 * and the worker's PDF use, so the preview is exactly what gets exported.
 */
const t = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`);
const req = (max: number, what: string) => z.string().trim().min(1, `${what} is required.`).max(max, `Keep this under ${max} characters.`);
const month = z.union([z.string().regex(/^\d{4}-\d{2}$/, 'Use a month like 2024-09.'), z.literal('')]).optional();
const link = z.union([z.string().trim().max(500).regex(/^https?:\/\//i, 'Start the link with https://'), z.literal('')]).optional();

export const itemDataSchemas = {
  EXPERIENCE: z.object({ role: req(150, 'Job title'), organisation: req(150, 'Organisation'), location: t(100).optional(), start: month, end: month }),
  PROJECT: z.object({ name: req(150, 'Project name'), url: link, summary: t(300).optional() }),
  SKILLS: z.object({ group: req(80, 'Group name'), skills: z.array(req(60, 'Skill')).max(60) }),
  EDUCATION: z.object({ qualification: req(200, 'Qualification'), institution: req(200, 'Institution'), location: t(100).optional(), start: month, end: month, detail: t(300).optional() }),
  CERTIFICATION: z.object({ name: req(200, 'Name'), issuer: t(150).optional(), date: month }),
  LINK: z.object({ label: req(60, 'Label'), url: z.string().trim().max(500).regex(/^https?:\/\//i, 'Start the link with https://') }),
} satisfies Record<ProfileKind, z.ZodType>;

export type ItemData = { [K in ProfileKind]: z.infer<(typeof itemDataSchemas)[K]> };

const bulletInput = z.object({ id: z.uuid().optional(), text: req(400, 'Bullet') });

export const profileItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('EXPERIENCE'), data: itemDataSchemas.EXPERIENCE, bullets: z.array(bulletInput).max(20).default([]) }),
  z.object({ kind: z.literal('PROJECT'), data: itemDataSchemas.PROJECT, bullets: z.array(bulletInput).max(20).default([]) }),
  z.object({ kind: z.literal('SKILLS'), data: itemDataSchemas.SKILLS, bullets: z.array(bulletInput).max(0).default([]) }),
  z.object({ kind: z.literal('EDUCATION'), data: itemDataSchemas.EDUCATION, bullets: z.array(bulletInput).max(10).default([]) }),
  z.object({ kind: z.literal('CERTIFICATION'), data: itemDataSchemas.CERTIFICATION, bullets: z.array(bulletInput).max(0).default([]) }),
  z.object({ kind: z.literal('LINK'), data: itemDataSchemas.LINK, bullets: z.array(bulletInput).max(0).default([]) }),
]);

export const profileContactSchema = z.object({
  fullName: req(120, 'Your name'),
  email: z.union([z.email('Enter a valid email address.'), z.literal('')]).optional().transform((v) => v || null),
  phone: t(40).optional().transform((v) => v || null),
  location: t(100).optional().transform((v) => v || null),
  headline: t(200).optional().transform((v) => v || null),
  summary: t(1500).optional().transform((v) => v || null),
});

export const reorderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(200) });

/** Which items and bullets a CV version shows, in order. Section order is the order kinds first appear. */
export const cvSelectionSchema = z.object({
  sections: z.array(z.enum(PROFILE_KINDS)).max(PROFILE_KINDS.length),
  items: z.array(z.object({ id: z.uuid(), bullets: z.array(z.uuid()).max(30) })).max(200),
});
export type CvSelection = z.infer<typeof cvSelectionSchema>;

export const cvVersionSchema = z.object({
  name: req(80, 'Version name'),
  headline: t(200).nullish().transform((v) => v || null),
  summary: t(1500).nullish().transform((v) => v || null),
  template: z.enum(CV_TEMPLATES).default('CLASSIC'),
  selection: cvSelectionSchema.optional(),
});
export const cvVersionUpdateSchema = cvVersionSchema.partial();

// ---------- Response shapes ----------

export interface ProfileBulletDto {
  id: string;
  text: string;
}
export type ProfileItemDto = { [K in ProfileKind]: { id: string; kind: K; data: ItemData[K]; bullets: ProfileBulletDto[] } }[ProfileKind];

export interface ProfileContact {
  fullName: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
  summary: string | null;
}

export interface ProfileDto {
  contact: ProfileContact;
  items: ProfileItemDto[];
}

export interface CvVersionDto {
  id: string;
  name: string;
  headline: string | null;
  summary: string | null;
  template: CvTemplate;
  selection: CvSelection;
  updatedAt: string;
}

// ---------- Render model ----------

export interface CvEntry {
  heading: string;
  subheading: string | null;
  meta: string | null;
  bullets: string[];
  /** Skills: the list after the group name. */
  inline: string | null;
}

export interface CvSection {
  kind: ProfileKind;
  title: string;
  entries: CvEntry[];
}

export interface CvDocument {
  name: string;
  headline: string | null;
  contact: string[];
  summary: string | null;
  sections: CvSection[];
}

export const SECTION_TITLES: Record<ProfileKind, string> = {
  EXPERIENCE: 'Experience',
  PROJECT: 'Projects',
  SKILLS: 'Skills',
  EDUCATION: 'Education',
  CERTIFICATION: 'Certifications',
  LINK: 'Links',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatMonth(v: string | undefined | null): string {
  if (!v) return '';
  const [y, m] = v.split('-');
  return `${MONTHS[Number(m) - 1] ?? ''} ${y}`.trim();
}
function range(start?: string, end?: string): string | null {
  if (!start && !end) return null;
  return `${formatMonth(start)} – ${end ? formatMonth(end) : 'Present'}`.replace(/^ – /, '');
}

/** Everything in the profile, in profile order: the default selection for a new CV version. */
export function fullSelection(items: ProfileItemDto[]): CvSelection {
  const sections: ProfileKind[] = [];
  for (const k of ['EXPERIENCE', 'PROJECT', 'SKILLS', 'EDUCATION', 'CERTIFICATION'] as const) if (items.some((i) => i.kind === k)) sections.push(k);
  return { sections, items: items.filter((i) => i.kind !== 'LINK').map((i) => ({ id: i.id, bullets: i.bullets.map((b) => b.id) })) };
}

function entryFor(item: ProfileItemDto, bulletIds: string[]): CvEntry {
  const bullets = bulletIds.map((id) => item.bullets.find((b) => b.id === id)?.text).filter((x): x is string => !!x);
  switch (item.kind) {
    case 'EXPERIENCE':
      return { heading: item.data.role, subheading: [item.data.organisation, item.data.location].filter(Boolean).join(', '), meta: range(item.data.start, item.data.end), bullets, inline: null };
    case 'PROJECT':
      return { heading: item.data.name, subheading: item.data.summary || null, meta: item.data.url ? item.data.url.replace(/^https?:\/\//, '') : null, bullets, inline: null };
    case 'SKILLS':
      return { heading: item.data.group, subheading: null, meta: null, bullets: [], inline: item.data.skills.join(', ') };
    case 'EDUCATION':
      return { heading: item.data.qualification, subheading: [item.data.institution, item.data.location].filter(Boolean).join(', '), meta: range(item.data.start, item.data.end), bullets: item.data.detail ? [item.data.detail, ...bullets] : bullets, inline: null };
    case 'CERTIFICATION':
      return { heading: item.data.name, subheading: item.data.issuer || null, meta: formatMonth(item.data.date) || null, bullets: [], inline: null };
    case 'LINK':
      return { heading: item.data.label, subheading: null, meta: item.data.url, bullets: [], inline: null };
  }
}

export function buildCvDocument(profile: ProfileDto, version: Pick<CvVersionDto, 'headline' | 'summary' | 'selection'>): CvDocument {
  const byId = new Map(profile.items.map((i) => [i.id, i]));
  const links = profile.items.filter((i): i is Extract<ProfileItemDto, { kind: 'LINK' }> => i.kind === 'LINK').map((l) => l.data.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''));
  const sections: CvSection[] = [];
  for (const kind of version.selection.sections) {
    if (kind === 'LINK') continue;
    const entries = version.selection.items
      .map((s) => {
        const item = byId.get(s.id);
        return item && item.kind === kind ? entryFor(item, s.bullets) : null;
      })
      .filter((e): e is CvEntry => !!e);
    if (entries.length) sections.push({ kind, title: SECTION_TITLES[kind], entries });
  }
  const c = profile.contact;
  return {
    name: c.fullName,
    headline: version.headline ?? c.headline,
    contact: [c.location, c.email, c.phone, ...links].filter((x): x is string => !!x),
    summary: version.summary ?? c.summary,
    sections,
  };
}

/** Plain text of a CV version, for the keyword match. */
export function cvDocumentText(doc: CvDocument): string {
  return [doc.headline, doc.summary, ...doc.sections.flatMap((s) => s.entries.flatMap((e) => [e.heading, e.subheading, e.inline, ...e.bullets]))].filter(Boolean).join('\n');
}

// ---------- Cover letters ----------

export interface LetterDocument {
  name: string;
  contact: string[];
  date: string;
  body: string;
}

export const PLACEHOLDERS = ['{company}', '{role}', '{hiringManager}', '{myName}'] as const;

/** Fills {company}, {role}, {hiringManager} and {myName}. Unknown hiring manager becomes "Hiring Manager". */
export function fillLetter(body: string, values: { company: string; role: string; hiringManager: string | null; myName: string }): string {
  return body
    .replaceAll('{company}', values.company)
    .replaceAll('{role}', values.role)
    .replaceAll('{hiringManager}', values.hiringManager || 'Hiring Manager')
    .replaceAll('{myName}', values.myName);
}

export const CV_TEMPLATE_NOTES: Record<CvTemplate, string> = {
  CLASSIC: 'Serif, centred header. Traditional and calm.',
  MODERN: 'Sans-serif, left-aligned, a thin accent rule under headings.',
  COMPACT: 'Smaller type and tighter spacing to fit more on one page.',
};
