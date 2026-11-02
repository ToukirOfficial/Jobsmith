import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobProcessors } from '../src/jobs/processors.js';
import { QueueService } from '../src/jobs/queue.service.js';
import { as, createUser, startApp, type Client, type TestContext } from './helpers.js';

let ctx: TestContext;
let c: Client;
let other: Client;

beforeAll(async () => {
  ctx = await startApp();
  c = await as(ctx, (await createUser(ctx.prisma, { name: 'Robin Ash' })).id);
  other = await as(ctx, (await createUser(ctx.prisma)).id);
});
afterAll(async () => ctx.app.close());

const runQueued = async () => {
  const processors = ctx.app.get(JobProcessors);
  for (const j of QueueService.testJobs.splice(0)) await processors.run(j.queue, j);
};

const experience = {
  kind: 'EXPERIENCE',
  data: { role: 'Software Developer', organisation: 'Fernleaf Studio', location: 'Leeds', start: '2023-09', end: '' },
  bullets: [{ text: 'Built a PDF export used by 4,000 customers a month' }, { text: 'Cut page load time by 40% with server-side rendering' }],
};

describe('profile and CV versions', () => {
  let versionId: string;
  let itemId: string;
  let bulletIds: string[];

  it('stores the profile as structured items with bullets', async () => {
    await c.put('/profile/contact', { fullName: 'Robin Ash', email: 'robin@test.example', location: 'Leeds', headline: 'Full-stack developer' });
    const p = await c.post('/profile/items', experience);
    expect(p.status).toBe(201);
    await c.post('/profile/items', { kind: 'SKILLS', data: { group: 'Languages', skills: ['TypeScript', 'SQL'] } });
    await c.post('/profile/items', { kind: 'LINK', data: { label: 'GitHub', url: 'https://github.com/robin-ash-example' } });
    const profile = (await c.get('/profile')).body;
    const item = profile.items.find((i: { kind: string }) => i.kind === 'EXPERIENCE');
    itemId = item.id;
    bulletIds = item.bullets.map((b: { id: string }) => b.id);
    expect(bulletIds).toHaveLength(2);
    expect((await c.post('/profile/items', { kind: 'EXPERIENCE', data: { role: '' } })).status).toBe(400);
  });

  it('keeps bullet ids when bullets are edited, so versions keep them', async () => {
    const res = await c.put(`/profile/items/${itemId}`, { ...experience, bullets: [{ id: bulletIds[1], text: 'Cut page load time by 45%' }, { id: bulletIds[0], text: experience.bullets[0]!.text }] });
    const item = res.body.items.find((i: { id: string }) => i.id === itemId);
    expect(item.bullets.map((b: { id: string }) => b.id)).toEqual([bulletIds[1], bulletIds[0]]);
  });

  it('creates a version with everything selected, and drops ids that aren’t yours', async () => {
    const v = await c.post('/cv-versions', { name: 'General full-stack', template: 'MODERN' });
    expect(v.status).toBe(201);
    versionId = v.body.id;
    expect(v.body.selection.sections).toEqual(['EXPERIENCE', 'SKILLS']);
    const foreign = (await other.post('/profile/items', experience)).body.items[0].id;
    const upd = await c.patch(`/cv-versions/${versionId}`, { selection: { sections: ['EXPERIENCE'], items: [{ id: itemId, bullets: [bulletIds[0]] }, { id: foreign, bullets: [] }] } });
    expect(upd.body.selection.items).toEqual([{ id: itemId, bullets: [bulletIds[0]] }]);
    expect((await other.get(`/cv-versions/${versionId}`)).status).toBe(404);
  });

  it('renders the PDF in the worker and serves it only to its owner', async () => {
    const job = await c.post(`/cv-versions/${versionId}/pdf`);
    expect(job.body.status).toBe('PENDING');
    await runQueued();
    const done = (await c.get(`/data-jobs/${job.body.id}`)).body;
    expect(done.status).toBe('DONE');
    const file = await c.get(`/files/${done.fileId}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (d: Buffer) => chunks.push(d));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['content-disposition']).toMatch(/attachment; filename="Robin-Ash-CV-General-full-stack.pdf"/);
    expect((file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await other.get(`/files/${done.fileId}`)).status).toBe(404);
    expect((await other.get(`/data-jobs/${job.body.id}`)).status).toBe(404);
  });
});

describe('CV snapshot immutability', () => {
  it('freezes exactly what was sent; later edits never change it', async () => {
    const profile = (await c.get('/profile')).body;
    const item = profile.items.find((i: { kind: string }) => i.kind === 'EXPERIENCE');
    const version = (await c.post('/cv-versions', { name: 'Legal-tech', template: 'CLASSIC' })).body;
    const app = (await c.post('/applications', { title: 'Developer', company: 'Quillmark Legal' })).body;
    await ctx.prisma.draft.create({ data: { userId: (await ctx.prisma.application.findUniqueOrThrow({ where: { id: app.id } })).userId, applicationId: app.id, kind: 'COVER_LETTER', body: 'Dear Hiring Manager,\n\nOriginal letter.' } });

    const applied = await c.post(`/applications/${app.id}/apply`, { channel: 'COMPANY_SITE', cvVersionId: version.id, attachCoverLetter: true });
    expect(applied.status).toBe(200);
    expect(applied.body.stage).toBe('APPLIED');
    expect(applied.body.channel).toBe('COMPANY_SITE');
    expect(applied.body.cvSnapshot.label).toBe('CV: Legal-tech');
    expect(applied.body.letterSnapshot).toBeTruthy();
    await runQueued();

    const before = (await c.get(`/snapshots/${applied.body.cvSnapshot.id}`)).body;
    expect(before.fileId).toBeTruthy();
    expect(JSON.stringify(before.content)).toContain('Built a PDF export');

    // Change everything the snapshot came from.
    await c.put(`/profile/items/${item.id}`, { ...experience, bullets: [{ text: 'Completely rewritten bullet' }] });
    await c.put('/profile/contact', { fullName: 'Robin Changed' });
    await c.patch(`/cv-versions/${version.id}`, { name: 'Renamed', template: 'COMPACT' });
    await ctx.prisma.draft.updateMany({ where: { applicationId: app.id }, data: { body: 'Edited letter' } });
    await c.delete(`/cv-versions/${version.id}`);

    const after = (await c.get(`/snapshots/${applied.body.cvSnapshot.id}`)).body;
    expect(after.content).toEqual(before.content);
    expect(after.fileId).toBe(before.fileId);
    const letter = (await c.get(`/snapshots/${applied.body.letterSnapshot.id}`)).body;
    expect(letter.content.letter.body).toContain('Original letter.');
    expect(letter.content.letter.name).toBe('Robin Ash');

    // There is no way to change or redo it.
    expect((await c.post(`/applications/${app.id}/apply`, { channel: 'EMAIL', cvVersionId: null })).status).toBe(409);
    expect((await c.patch(`/snapshots/${applied.body.cvSnapshot.id}`, { label: 'x' })).status).toBe(404);
    expect((await c.put(`/snapshots/${applied.body.cvSnapshot.id}`, { label: 'x' })).status).toBe(404);
    expect((await c.delete(`/snapshots/${applied.body.cvSnapshot.id}`)).status).toBe(404);
    expect((await other.get(`/snapshots/${applied.body.cvSnapshot.id}`)).status).toBe(404);
  });
});
