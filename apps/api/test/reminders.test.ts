import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MailService } from '../src/mail/mail.service.js';
import { RemindersService } from '../src/reminders/reminders.service.js';
import { anon, as, clearOutbox, createUser, startApp, type Client, type TestContext } from './helpers.js';

let ctx: TestContext;
let c: Client;
let userId: string;
let sweeper: RemindersService;
const DAY = 86_400_000;

beforeAll(async () => {
  ctx = await startApp();
  const user = await createUser(ctx.prisma, { name: 'Casey Field' });
  userId = user.id;
  c = await as(ctx, user.id);
  sweeper = ctx.app.get(RemindersService);
  // Other test files leave due reminders behind; start from a clean slate so counts are exact.
  await ctx.prisma.reminder.updateMany({ where: { sentAt: null }, data: { sentAt: new Date() } });
});
afterAll(async () => ctx.app.close());
beforeEach(clearOutbox);

describe('reminder scheduling', () => {
  it('plans a follow-up for 09:00 London time N days after applying', async () => {
    await c.patch('/me', { name: 'Casey Field', timeZone: 'Europe/London', weeklyTarget: 5, followUpDays: 7, emailReminders: true, targetRoles: [], targetLocations: [] });
    const app = (await c.post('/applications', { title: 'Engineer', company: 'Halcyon Rail' })).body;
    await c.post(`/applications/${app.id}/apply`, { channel: 'EMAIL', appliedOn: '2026-11-02', attachCoverLetter: false });
    const r = await ctx.prisma.reminder.findFirstOrThrow({ where: { applicationId: app.id, kind: 'FOLLOW_UP' } });
    // 9 Nov 2026 is after the clocks change (GMT), so 09:00 London is 09:00 UTC.
    expect(r.dueAt.toISOString()).toBe('2026-11-09T09:00:00.000Z');
  });

  it('plans "interview tomorrow" for 09:00 the day before, in summer time too', async () => {
    const app = (await c.post('/applications', { title: 'Engineer', company: 'Sundial Labs' })).body;
    const i = await c.post('/interviews', { applicationId: app.id, type: 'TECHNICAL', startsAt: '2027-06-16T13:00:00.000Z' });
    const r = await ctx.prisma.reminder.findFirstOrThrow({ where: { interviewId: i.body.id } });
    expect(r.dueAt.toISOString()).toBe('2027-06-15T08:00:00.000Z'); // 09:00 BST
  });

  it('sends each due reminder once, even when sweeps overlap', async () => {
    const app = (await c.post('/applications', { title: 'Developer', company: 'Once Only Ltd' })).body;
    const startsAt = new Date(Date.now() + 2 * 3600_000).toISOString();
    await c.post('/interviews', { applicationId: app.id, type: 'PHONE_SCREEN', startsAt });
    const r = await ctx.prisma.reminder.findFirstOrThrow({ where: { applicationId: app.id } });
    await ctx.prisma.reminder.update({ where: { id: r.id }, data: { dueAt: new Date(Date.now() - 60_000) } });

    const [a, b] = await Promise.all([sweeper.sweep(), sweeper.sweep()]);
    expect(a.emailed + b.emailed).toBe(1);
    expect(await sweeper.sweep()).toEqual({ claimed: 0, emailed: 0 });
    const mails = MailService.outbox.filter((m) => m.subject.includes('Once Only Ltd'));
    expect(mails).toHaveLength(1);
    const row = await ctx.prisma.reminder.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.sentAt).not.toBeNull();
    expect(row.emailedAt).not.toBeNull();

    // Editing the application again never re-arms a reminder that already fired.
    await c.patch(`/applications/${app.id}`, { notes: 'Prepared' });
    expect((await ctx.prisma.reminder.findUniqueOrThrow({ where: { id: r.id } })).sentAt).not.toBeNull();
    expect(await sweeper.sweep()).toEqual({ claimed: 0, emailed: 0 });
  });

  it('never emails dismissed reminders, stale backlog, or users who turned email off', async () => {
    const app = (await c.post('/applications', { title: 'Developer', company: 'Quiet Co' })).body;
    await c.post(`/applications/${app.id}/apply`, { channel: 'EMAIL', appliedOn: '2026-01-05', attachCoverLetter: false });
    const r = await ctx.prisma.reminder.findFirstOrThrow({ where: { applicationId: app.id } });
    expect(r.dueAt.getTime()).toBeLessThan(Date.now() - 3 * DAY);
    await sweeper.sweep();
    expect(MailService.outbox).toHaveLength(0);

    const due = await c.get('/reminders?scope=due');
    expect(due.body.some((x: { id: string }) => x.id === r.id)).toBe(true);
    const dismissed = await c.patch(`/reminders/${r.id}`, { dismissed: true });
    expect(dismissed.body.dismissedAt).toBeTruthy();
    expect((await c.get('/reminders?scope=due')).body.some((x: { id: string }) => x.id === r.id)).toBe(false);
  });
});

describe('calendar', () => {
  it('lists interviews, closing dates and follow-ups, and serves a private iCal feed', async () => {
    const app = (await c.post('/applications', { title: 'Platform Engineer', company: 'Calendar Corp', closingDate: '2027-02-10' })).body;
    await c.post('/interviews', { applicationId: app.id, type: 'FINAL', startsAt: '2027-02-03T10:00:00.000Z' });
    const events = (await c.get('/calendar?from=2027-02-01&to=2027-03-01')).body;
    expect(events.map((e: { kind: string }) => e.kind)).toEqual(['INTERVIEW', 'CLOSING']);

    const feed = (await c.get('/me/calendar-feed')).body.url as string;
    const path = new URL(feed).pathname.replace('/api/v1', '');
    const ics = await anon(ctx).get(path);
    expect(ics.status).toBe(200);
    expect(ics.headers['content-type']).toMatch(/text\/calendar/);
    expect(ics.text).toContain('BEGIN:VCALENDAR');
    expect(ics.text).toContain('SUMMARY:Final: Platform Engineer at Calendar Corp');
    expect(ics.text).toContain('DTSTART;VALUE=DATE:20270210');

    expect((await anon(ctx).get('/calendar/not-a-real-token-abcdefghijk.ics')).status).toBe(404);
    await c.post('/me/calendar-feed/rotate');
    expect((await anon(ctx).get(path)).status).toBe(404);
    expect((await anon(ctx).get('/calendar?from=2027-02-01&to=2027-03-01')).status).toBe(401);
    void userId;
  });
});
