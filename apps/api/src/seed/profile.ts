import { buildCvDocument, type CvSelection, type ProfileDto, type ProfileItemDto } from '@jobsmith/shared';
import { renderCvBuffer } from '@jobsmith/pdf';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma.service.js';
import { FilesService } from '../files/files.service.js';
import { toVersionDto } from '../cv/cv-versions.service.js';

/** Alex Morgan's fictional profile: every organisation and project here is made up. */
const ITEMS: { kind: ProfileItemDto['kind']; data: Record<string, unknown>; bullets?: string[]; tags: string[] }[] = [
  {
    kind: 'EXPERIENCE',
    data: { role: 'Software Developer', organisation: 'Fernleaf Studio', location: 'Manchester', start: '2024-02', end: '' },
    bullets: [
      'Built a document export service in Node.js and TypeScript that turns 4,000 contracts a month into accessible PDFs',
      'Cut the main dashboard’s load time from 3.1 s to 1.2 s by moving reports to server-side rendering and adding PostgreSQL indexes',
      'Led the move from a hand-rolled job runner to BullMQ queues, removing a weekly on-call problem',
      'Reviewed code for three junior developers and wrote the team’s testing guide',
    ],
    tags: ['general', 'legal', 'backend'],
  },
  {
    kind: 'EXPERIENCE',
    data: { role: 'Junior Web Developer', organisation: 'Larchmont Digital', location: 'Leeds', start: '2022-08', end: '2024-01' },
    bullets: [
      'Shipped 20+ React features for retail clients, each behind a feature flag with automated tests',
      'Built an accessible checkout that passed a WCAG 2.2 AA audit with no major issues',
      'Wrote REST endpoints in Express for stock and pricing data',
    ],
    tags: ['general', 'legal', 'backend'],
  },
  {
    kind: 'PROJECT',
    data: { name: 'Clausebook', url: 'https://github.com/alex-morgan-example/clausebook', summary: 'Search and compare contract clauses' },
    bullets: ['Full-text search over 10,000 sample clauses with PostgreSQL tsvector', 'NestJS API with role-based access and audit logging'],
    tags: ['legal', 'general'],
  },
  {
    kind: 'PROJECT',
    data: { name: 'Queue Watch', url: 'https://github.com/alex-morgan-example/queue-watch', summary: 'A small dashboard for Redis job queues' },
    bullets: ['Real-time view of BullMQ queues over Server-Sent Events', 'Used by two local start-ups'],
    tags: ['backend', 'general'],
  },
  { kind: 'SKILLS', data: { group: 'Languages', skills: ['TypeScript', 'JavaScript', 'SQL', 'Python'] }, tags: ['general', 'legal', 'backend'] },
  { kind: 'SKILLS', data: { group: 'Frameworks and tools', skills: ['React', 'Next.js', 'Node.js', 'NestJS', 'PostgreSQL', 'Redis', 'Docker', 'Git'] }, tags: ['general', 'legal', 'backend'] },
  { kind: 'SKILLS', data: { group: 'Practices', skills: ['Automated testing', 'Accessibility (WCAG 2.2)', 'Code review', 'CI/CD'] }, tags: ['general', 'legal'] },
  {
    kind: 'EDUCATION',
    data: { qualification: 'MSc Advanced Computer Science', institution: 'University of Northbridge', location: 'Manchester', start: '2021-09', end: '2022-09', detail: 'Merit. Dissertation on full-text search for legal documents.' },
    tags: ['general', 'legal', 'backend'],
  },
  { kind: 'EDUCATION', data: { qualification: 'BSc Computer Science', institution: 'Eastvale University', start: '2017-09', end: '2021-06' }, tags: ['general', 'legal', 'backend'] },
  { kind: 'CERTIFICATION', data: { name: 'AWS Certified Developer – Associate', issuer: 'Amazon Web Services', date: '2024-05' }, tags: ['backend'] },
  { kind: 'LINK', data: { label: 'GitHub', url: 'https://github.com/alex-morgan-example' }, tags: [] },
  { kind: 'LINK', data: { label: 'Portfolio', url: 'https://alexmorgan.example' }, tags: [] },
];

const VERSIONS = [
  { tag: 'general', name: 'General full-stack', template: 'MODERN' as const, headline: 'Full-stack developer: TypeScript, React, Node.js', summary: null },
  {
    tag: 'legal',
    name: 'Legal-tech',
    template: 'CLASSIC' as const,
    headline: 'Full-stack developer for document-heavy products',
    summary: 'Full-stack developer with two years building document generation and search for contract-heavy products. I care about correct, accessible output and simple, well-tested code.',
  },
  { tag: 'backend', name: 'Backend focus', template: 'COMPACT' as const, headline: 'Backend engineer: Node.js, PostgreSQL, queues', summary: 'Backend-leaning developer. I like making slow things fast and flaky things boring.' },
];

export async function seedProfile(tx: Prisma.TransactionClient, userId: string): Promise<string[]> {
  await tx.profile.update({
    where: { userId },
    data: {
      fullName: 'Alex Morgan',
      email: 'alex.morgan@jobsmith.example',
      phone: '07700 900123',
      location: 'Manchester, UK',
      headline: 'Full-stack developer',
      summary: 'Full-stack developer with two years in product teams, shipping TypeScript, React and Node.js features end to end. I write plain, well-tested code and measure what I change.',
    },
  });
  const created: { id: string; tags: string[]; bullets: string[] }[] = [];
  const order: Record<string, number> = {};
  for (const it of ITEMS) {
    const sortOrder = (order[it.kind] = (order[it.kind] ?? -1) + 1);
    const row = await tx.profileItem.create({ data: { userId, kind: it.kind, data: it.data as Prisma.InputJsonValue, sortOrder } });
    const bullets: string[] = [];
    for (const [i, text] of (it.bullets ?? []).entries()) bullets.push((await tx.profileBullet.create({ data: { userId, itemId: row.id, text, sortOrder: i } })).id);
    created.push({ id: row.id, tags: it.tags, bullets });
  }
  const ids: string[] = [];
  for (const v of VERSIONS) {
    const items = created.filter((c) => c.tags.includes(v.tag)).map((c) => ({ id: c.id, bullets: v.tag === 'backend' ? c.bullets.slice(0, 2) : c.bullets }));
    const sections: CvSelection['sections'] = v.tag === 'backend' ? ['EXPERIENCE', 'SKILLS', 'PROJECT', 'CERTIFICATION', 'EDUCATION'] : ['EXPERIENCE', 'PROJECT', 'SKILLS', 'EDUCATION'];
    ids.push((await tx.cvVersion.create({ data: { userId, name: v.name, template: v.template, headline: v.headline, summary: v.summary, selection: { sections, items } } })).id);
  }
  return ids;
}

/** Applied jobs get the frozen CV they were "sent", with a real PDF rendered once per version. */
export async function seedSnapshots(prisma: PrismaService, userId: string, profile: ProfileDto) {
  const files = new FilesService(prisma);
  const apps = await prisma.application.findMany({ where: { userId, cvVersionId: { not: null }, cvSnapshotId: null }, include: { cvVersion: true } });
  const rendered = new Map<string, { doc: ReturnType<typeof buildCvDocument>; pdf: Buffer; template: string; name: string }>();
  for (const app of apps) {
    const v = toVersionDto(app.cvVersion!);
    let r = rendered.get(v.id);
    if (!r) {
      const doc = buildCvDocument(profile, v);
      r = { doc, pdf: await renderCvBuffer(doc, v.template), template: v.template, name: v.name };
      rendered.set(v.id, r);
    }
    const file = await files.save(userId, 'CV_PDF', `Alex-Morgan-CV-${v.name.replace(/\W+/g, '-')}.pdf`, 'application/pdf', r.pdf);
    const snap = await prisma.snapshot.create({
      data: { userId, applicationId: app.id, kind: 'CV', label: `CV: ${v.name}`, content: { doc: r.doc, template: r.template, versionName: r.name } as unknown as Prisma.InputJsonValue, fileId: file.id, createdAt: app.appliedAt ?? app.createdAt },
    });
    await prisma.application.update({ where: { id: app.id }, data: { cvSnapshotId: snap.id } });
  }
}
