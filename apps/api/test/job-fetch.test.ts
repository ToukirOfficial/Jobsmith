import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { JobFetchService } from '../src/job-fetch/job-fetch.service.js';
import { JobProcessors } from '../src/jobs/processors.js';
import { QueueService } from '../src/jobs/queue.service.js';
import { as, createUser, startApp, type Client, type TestContext } from './helpers.js';

let ctx: TestContext;
let c: Client;
let other: Client;

beforeAll(async () => {
  ctx = await startApp();
  c = await as(ctx, (await createUser(ctx.prisma)).id);
  other = await as(ctx, (await createUser(ctx.prisma)).id);
});
afterAll(async () => ctx.app.close());
afterEach(() => {
  JobFetchService.testOptions = {};
  QueueService.testJobs.length = 0;
});

const runQueued = async () => {
  const processors = ctx.app.get(JobProcessors);
  for (const j of QueueService.testJobs.splice(0)) await processors.run(j.queue, j);
};

describe('save a job by link', () => {
  it('refuses LinkedIn and Indeed links straight away, asking for pasted text', async () => {
    const res = await c.post('/job-fetch', { url: 'https://www.linkedin.com/jobs/view/123' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BLOCKED_SITE');
    expect((await c.post('/job-fetch', { url: 'file:///etc/passwd' })).status).toBe(400);
  });

  it('queues the fetch (never inside the request) and records a blocked address as a failure', async () => {
    const res = await c.post('/job-fetch', { url: 'http://localhost/admin' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(QueueService.testJobs).toHaveLength(1);
    await runQueued();
    const done = await c.get(`/job-fetch/${res.body.id}`);
    expect(done.body.status).toBe('FAILED');
    expect(done.body.errorCode).toBe('BLOCKED_ADDRESS');
    expect((await other.get(`/job-fetch/${res.body.id}`)).status).toBe(404);
  });
});
