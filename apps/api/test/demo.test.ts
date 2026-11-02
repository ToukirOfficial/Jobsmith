import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetConfig } from '../src/config.js';
import { DemoService } from '../src/demo/demo.service.js';
import { JobProcessors } from '../src/jobs/processors.js';
import { QueueService } from '../src/jobs/queue.service.js';
import { anon, startApp, type TestContext } from './helpers.js';

let ctx: TestContext;
const CSRF = 'd'.repeat(24);

beforeAll(async () => {
  process.env['DEMO_MODE'] = 'true';
  resetConfig();
  ctx = await startApp();
});
afterAll(async () => {
  await ctx.app.close();
  process.env['DEMO_MODE'] = 'false';
  resetConfig();
});

/** Starts a demo visit and returns a client carrying that visitor's cookies. */
async function visitor() {
  const res = await request(ctx.http).post('/api/v1/demo/start').set('x-forwarded-for', `10.0.0.${Math.floor(Math.random() * 200)}`);
  expect(res.status).toBe(200);
  const cookies = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
  const h = { Cookie: `${cookies}; js_csrf=${CSRF}`, 'x-csrf-token': CSRF };
  return {
    get: (u: string) => request(ctx.http).get(`/api/v1${u}`).set(h),
    post: (u: string, b?: object) => request(ctx.http).post(`/api/v1${u}`).set(h).send(b ?? {}),
    put: (u: string, b?: object) => request(ctx.http).put(`/api/v1${u}`).set(h).send(b ?? {}),
  };
}

const runQueued = async () => {
  const p = ctx.app.get(JobProcessors);
  for (const j of QueueService.testJobs.splice(0)) await p.run(j.queue, j);
};

describe('demo mode', () => {
  it('gives each visitor a private, fictional job search; setup and sign-up stay closed', async () => {
    expect((await anon(ctx).get('/setup')).body).toMatchObject({ setupNeeded: false, signupEnabled: false, demoMode: true });
    expect((await anon(ctx).post('/setup', { name: 'X', email: 'x@test.example', password: 'long-enough-password' })).status).toBe(403);
    const a = await visitor();
    const b = await visitor();
    const me = (await a.get('/me')).body;
    expect(me).toMatchObject({ isDemo: true, demoMode: true, name: 'Alex Morgan' });
    const appsA = (await a.get('/applications?archived=all')).body;
    expect(appsA.total).toBe(25);
    const idA = appsA.items[0].id;
    expect((await b.get(`/applications/${idA}`)).status).toBe(404);
    expect((await a.get('/cv-versions')).body).toHaveLength(3);
    await runQueued();
    expect((await a.get('/demo/mail')).status).toBe(200);
  });

  it('only "fetches" the bundled sample job pages, never the internet', async () => {
    const v = await visitor();
    expect((await v.post('/job-fetch', { url: 'https://example.com/jobs/1' })).body.code).toBe('DEMO_ONLY');
    const job = await v.post('/job-fetch', { url: 'https://careers.demo-jobs.example/data-engineer' });
    expect(job.status).toBe(201);
    await runQueued();
    const done = (await v.get(`/job-fetch/${job.body.id}`)).body;
    expect(done.draft).toMatchObject({ method: 'JSON_LD', title: 'Data Engineer', company: 'Pennant Analytics', salaryMinPence: 4_800_000 });
  });

  it('replays a recorded agent run for visitors without a key', async () => {
    const v = await visitor();
    const app = (await v.get('/applications?q=Atlas')).body.items[0];
    const run = (await v.post(`/applications/${app.id}/agent-runs`)).body;
    expect(run.replay).toBe(true);
    await runQueued();
    const done = (await v.get(`/agent-runs/${run.id}`)).body;
    expect(done.steps.map((s: { status: string }) => s.status)).toEqual(Array(7).fill('DONE'));
    expect(done.steps[4].output.letter).toContain('Atlas Freight Software');
    expect(done.steps[3].output.cvVersionName).toBeTruthy();
    expect((await v.post(`/agent-runs/${run.id}/steps/4/rerun`)).status).toBe(409);
  });

  it('lets the seeded demo account (no expiry) log in without a code', async () => {
    const { createUser, PASSWORD } = await import('./helpers.js');
    const seeded = await createUser(ctx.prisma, { isDemo: true });
    const res = await anon(ctx).post('/auth/login', { email: seeded.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('deletes a visitor and the key they tried after 24 hours', async () => {
    const v = await visitor();
    const key = 'AIzaSy-demo-visitor-key-9876';
    expect((await v.put('/ai/settings', { provider: 'GEMINI', apiKey: key })).body.keyLast4).toBe('9876');
    const me = (await v.get('/me')).body;
    const row = await ctx.prisma.aiSettings.findUniqueOrThrow({ where: { userId: me.id } });
    expect(row.keyCipher).not.toContain(key);

    // Not yet expired: the hourly purge leaves the visitor alone.
    const purge = ctx.app.get(DemoService);
    await purge.purge();
    expect(await ctx.prisma.user.count({ where: { id: me.id } })).toBe(1);

    // 24 hours later: the session stops working and the purge removes the visitor, key and all.
    await ctx.prisma.user.update({ where: { id: me.id }, data: { demoExpiresAt: new Date(Date.now() - 1000) } });
    expect((await v.get('/me')).status).toBe(401);
    expect((await purge.purge()).removed).toBeGreaterThanOrEqual(1);
    expect(await ctx.prisma.user.count({ where: { id: me.id } })).toBe(0);
    expect(await ctx.prisma.aiSettings.count({ where: { userId: me.id } })).toBe(0);
    expect(await ctx.prisma.application.count({ where: { userId: me.id } })).toBe(0);
  });
});
