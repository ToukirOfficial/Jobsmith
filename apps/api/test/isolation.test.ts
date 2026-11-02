import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, startApp, type Client, type TestContext } from './helpers.js';
import { seedOwnedRecords, type OwnedRecords } from './fixtures.js';

/**
 * User data isolation (project rule 2): user B must never read, change or delete anything of user A's,
 * through any route that takes an id. Each phase adds its records to fixtures.ts and its routes here.
 */
let ctx: TestContext;
let a: OwnedRecords;
let bClient: Client;

beforeAll(async () => {
  ctx = await startApp();
  const userA = await createUser(ctx.prisma, { name: 'User A' });
  const userB = await createUser(ctx.prisma, { name: 'User B' });
  a = await seedOwnedRecords(ctx.prisma, userA.id);
  bClient = await as(ctx, userB.id);
});
afterAll(async () => ctx.app.close());

const routes = (r: OwnedRecords): [string, string, object?][] => [
  ['get', `/applications/${r.applicationId}`],
  ['patch', `/applications/${r.applicationId}`, { title: 'Hijacked' }],
  ['post', `/applications/${r.applicationId}/stage`, { stage: 'OFFER' }],
  ['post', `/applications/${r.applicationId}/archive`, { archived: true }],
  ['delete', `/applications/${r.applicationId}`],
  ['get', `/companies/${r.companyId}`],
  ['patch', `/companies/${r.companyId}`, { notes: 'x' }],
  ['get', `/contacts/${r.contactId}`],
  ['patch', `/contacts/${r.contactId}`, { name: 'x', type: 'OTHER' }],
  ['post', `/contacts/${r.contactId}/logs`, { direction: 'SENT', channel: 'EMAIL', at: new Date().toISOString(), note: 'x' }],
  ['delete', `/contacts/${r.contactId}`],
  ['post', `/applications/${r.applicationId}/contacts`, { contactId: r.contactId }],
  ['patch', `/interviews/${r.interviewId}`, { prepNotes: 'x' }],
  ['delete', `/interviews/${r.interviewId}`],
];

describe('user data isolation', () => {
  it('another user gets 404 on every record route', async () => {
    for (const [method, url, body] of routes(a)) {
      const res = await (bClient[method as 'get'] as (u: string, b?: object) => ReturnType<Client['get']>)(url, body);
      expect(res.status, `${method.toUpperCase()} ${url}`).toBe(404);
    }
  });

  it('lists never include another user’s records', async () => {
    for (const url of ['/applications', '/companies', '/contacts', '/interviews']) {
      const res = await bClient.get(url);
      expect(res.status, url).toBe(200);
      expect(JSON.stringify(res.body), url).not.toContain(a.applicationId);
      expect(JSON.stringify(res.body), url).not.toContain(a.companyId);
      expect(JSON.stringify(res.body), url).not.toContain(a.contactId);
    }
  });

  it('nothing of user A changed', async () => {
    const app = await ctx.prisma.application.findUniqueOrThrow({ where: { id: a.applicationId } });
    expect(app.title).toBe('Backend Engineer');
    expect(app.stage).toBe('SAVED');
    expect(app.archivedAt).toBeNull();
    expect(await ctx.prisma.contact.count({ where: { id: a.contactId } })).toBe(1);
    expect(await ctx.prisma.interview.count({ where: { id: a.interviewId } })).toBe(1);
  });

  it('every route needs a login unless marked public', async () => {
    const res = await ctx.app.getHttpAdapter().getInstance();
    expect(res).toBeTruthy();
    for (const [method, url] of routes(a)) {
      const r = await (await import('supertest')).default(ctx.http)[method as 'get'](`/api/v1${url}`);
      expect([401, 403], `${method} ${url}`).toContain(r.status);
    }
  });
});
