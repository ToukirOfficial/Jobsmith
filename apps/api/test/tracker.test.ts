import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, startApp, type Client, type TestContext } from './helpers.js';

let ctx: TestContext;
let c: Client;
let userId: string;

beforeAll(async () => {
  ctx = await startApp();
  const user = await createUser(ctx.prisma);
  userId = user.id;
  c = await as(ctx, user.id);
});
afterAll(async () => ctx.app.close());

const job = (over: object = {}) => ({ title: 'Full-stack Developer', company: 'Brightwave Ltd', location: 'Leeds', salaryMinPence: 4_000_000, salaryMaxPence: 4_800_000, ...over });

describe('applications', () => {
  it('creates a company once for name variants and warns about duplicates', async () => {
    const a = await c.post('/applications', job());
    expect(a.status).toBe(201);
    expect(a.body.company.name).toBe('Brightwave Ltd');
    expect(a.body.stage).toBe('SAVED');
    // UNKNOWN before the register is loaded, NOT_FOUND after (the sponsor tests may run first).
    expect(['UNKNOWN', 'NOT_FOUND']).toContain(a.body.sponsor.status);

    const b = await c.post('/applications', job({ title: 'Backend Engineer', company: 'BRIGHTWAVE LIMITED' }));
    expect(b.body.company.id).toBe(a.body.company.id);

    const dup = await c.get('/applications/duplicates?company=brightwave&title=Full-stack%20developer');
    expect(dup.body).toHaveLength(1);
    expect(dup.body[0].id).toBe(a.body.id);
  });

  it('validates input', async () => {
    const res = await c.post('/applications', { title: '', company: 'X', salaryMinPence: 500, salaryMaxPence: 100 });
    expect(res.status).toBe(400);
    expect(res.body.fields.title).toBeTruthy();
    expect((await c.post('/applications', { title: 'T', company: 'X', url: 'javascript:alert(1)' })).status).toBe(400);
  });

  it('moves through stages with history, applied date, first reply and a follow-up reminder', async () => {
    const a = (await c.post('/applications', job({ company: 'Kestrel Systems' }))).body;
    const applied = await c.post(`/applications/${a.id}/stage`, { stage: 'APPLIED', position: 0 });
    expect(applied.status).toBe(200);
    expect(applied.body.appliedAt).toBeTruthy();
    expect(applied.body.nextReminder.kind).toBe('FOLLOW_UP');
    const followUp = await ctx.prisma.reminder.findFirstOrThrow({ where: { applicationId: a.id, kind: 'FOLLOW_UP' } });
    const days = (followUp.dueAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(5.5);
    expect(days).toBeLessThan(8);

    await c.post(`/applications/${a.id}/stage`, { stage: 'SCREENING' });
    const detail = (await c.get(`/applications/${a.id}`)).body;
    expect(detail.stageHistory.map((e: { to: string }) => e.to)).toEqual(['SAVED', 'APPLIED', 'SCREENING']);
    expect(detail.timeline.some((t: { text: string }) => t.text === 'Moved from Applied to Screening')).toBe(true);
    // The follow-up no longer applies once they replied.
    expect(await ctx.prisma.reminder.count({ where: { applicationId: a.id, kind: 'FOLLOW_UP' } })).toBe(0);
    const row = await ctx.prisma.application.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.firstReplyAt).not.toBeNull();
  });

  it('reorders cards inside a column', async () => {
    const ids: string[] = [];
    for (const t of ['One', 'Two', 'Three']) ids.push((await c.post('/applications', job({ title: t, company: `Order Co ${t}` }))).body.id);
    await c.post(`/applications/${ids[0]}/stage`, { stage: 'SAVED', position: 0 });
    const list = (await c.get('/applications?stage=SAVED&sort=stage&dir=asc')).body.items as { id: string }[];
    expect(list[0]!.id).toBe(ids[0]);
  });

  it('filters, searches and archives', async () => {
    const a = (await c.post('/applications', job({ title: 'Data Engineer', company: 'Lumen Analytics', location: 'Bristol' }))).body;
    expect((await c.get('/applications?q=lumen')).body.items.map((i: { id: string }) => i.id)).toEqual([a.id]);
    expect((await c.get('/applications?location=bristol')).body.total).toBe(1);
    await c.post(`/applications/${a.id}/archive`, { archived: true });
    expect((await c.get('/applications?q=lumen')).body.total).toBe(0);
    expect((await c.get('/applications?q=lumen&archived=true')).body.total).toBe(1);
  });

  it('plans a closing-soon reminder for saved jobs with a closing date', async () => {
    const closing = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const a = (await c.post('/applications', job({ company: 'Harbour Health', closingDate: closing }))).body;
    const r = await ctx.prisma.reminder.findFirstOrThrow({ where: { applicationId: a.id } });
    expect(r.kind).toBe('CLOSING_SOON');
    expect(r.userId).toBe(userId);
  });
});

describe('contacts and interviews', () => {
  it('links a contact, logs a message and shows it on the timeline', async () => {
    const a = (await c.post('/applications', job({ company: 'Pebble Finance' }))).body;
    const contact = await c.post('/contacts', { name: 'Morgan Vale', type: 'RECRUITER', companyId: a.company.id, email: 'morgan@pebble.example', applicationIds: [a.id] });
    expect(contact.status).toBe(201);
    expect(contact.body.applications).toHaveLength(1);
    const log = await c.post(`/contacts/${contact.body.id}/logs`, { direction: 'SENT', channel: 'LINKEDIN', at: new Date().toISOString(), note: 'Sent a short intro note', applicationId: a.id });
    expect(log.body.logs).toHaveLength(1);
    const detail = (await c.get(`/applications/${a.id}`)).body;
    expect(detail.contacts[0].name).toBe('Morgan Vale');
    expect(detail.timeline.some((t: { kind: string }) => t.kind === 'contact')).toBe(true);
  });

  it('adds an interview with prep notes and plans the day-before reminder', async () => {
    const a = (await c.post('/applications', job({ company: 'Orbit Labs' }))).body;
    const startsAt = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const i = await c.post('/interviews', { applicationId: a.id, type: 'TECHNICAL', startsAt, prepNotes: 'Revise system design' });
    expect(i.status).toBe(201);
    expect(i.body.prepNotes).toBe('Revise system design');
    const r = await ctx.prisma.reminder.findFirstOrThrow({ where: { interviewId: i.body.id } });
    expect(r.kind).toBe('INTERVIEW_TOMORROW');
    expect(r.dueAt.getTime()).toBeLessThan(new Date(startsAt).getTime());

    const done = await c.patch(`/interviews/${i.body.id}`, { reflections: 'Went well', completed: true });
    expect(done.body.completedAt).toBeTruthy();
    expect(await ctx.prisma.reminder.count({ where: { interviewId: i.body.id } })).toBe(0);

    const takeHome = await c.post('/interviews', { applicationId: a.id, type: 'TAKE_HOME' });
    expect(takeHome.status).toBe(400);
  });
});
