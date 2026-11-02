import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobProcessors } from '../src/jobs/processors.js';
import { QueueService } from '../src/jobs/queue.service.js';
import { as, createUser, startApp, type Client, type TestContext } from './helpers.js';

let ctx: TestContext;
let c: Client;
let other: Client;

beforeAll(async () => {
  ctx = await startApp();
  c = await as(ctx, (await createUser(ctx.prisma, { name: 'Dana Export' })).id);
  other = await as(ctx, (await createUser(ctx.prisma, { name: 'Other Person' })).id);
});
afterAll(async () => ctx.app.close());

const runQueued = async () => {
  const p = ctx.app.get(JobProcessors);
  for (const j of QueueService.testJobs.splice(0)) await p.run(j.queue, j);
};

async function download(client: Client, fileId: string): Promise<Buffer> {
  const res = await client.get(`/files/${fileId}`).buffer(true).parse((r, cb) => {
    const chunks: Buffer[] = [];
    r.on('data', (d: Buffer) => chunks.push(d));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  expect(res.status).toBe(200);
  return res.body as Buffer;
}

const unzip = (zip: Buffer, name: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'js-export-'));
  const file = path.join(dir, 'export.zip');
  writeFileSync(file, zip);
  return execFileSync('unzip', ['-p', file, name]).toString('utf8');
};

describe('CSV import', () => {
  const csv = 'Role,Employer,Status,Date applied,Salary,Source,Notes\nData Engineer,Riverbend Analytics,Interviewing,03/10/2026,£48k,LinkedIn,Liked the team\nQA Engineer,Tollgate Ltd,applied,2026-10-12,,Indeed,\n,Missing Role Co,saved,,,,\n';

  it('suggests a column mapping from the headings', async () => {
    const res = await c.post('/imports/preview', { csv });
    expect(res.body.headers).toEqual(['Role', 'Employer', 'Status', 'Date applied', 'Salary', 'Source', 'Notes']);
    expect(res.body.mapping).toMatchObject({ title: 0, company: 1, stage: 2, appliedOn: 3, salaryMin: 4, channel: 5, notes: 6, location: null });
    expect(res.body.rowCount).toBe(3);
  });

  it('imports rows in the worker, skips bad ones, and reads UK dates and stages', async () => {
    const mapping = (await c.post('/imports/preview', { csv })).body.mapping;
    const job = await c.post('/imports', { csv, mapping });
    expect(job.status).toBe(201);
    await runQueued();
    const done = (await c.get(`/data-jobs/${job.body.id}`)).body;
    expect(done.result).toMatchObject({ created: 2, skipped: 1 });
    const list = (await c.get('/applications?q=Riverbend')).body.items;
    expect(list[0]).toMatchObject({ stage: 'INTERVIEW', channel: 'LINKEDIN', salaryMinPence: 4_800_000 });
    expect(list[0].appliedAt.slice(0, 10)).toBe('2026-10-03');
    expect((await other.get('/applications?q=Riverbend')).body.total).toBe(0);
    expect((await c.post('/imports', { csv, mapping: { ...mapping, title: null } })).status).toBe(400);
  });
});

describe('dashboard', () => {
  it('counts the funnel, response rates and this week’s goal', async () => {
    const res = await c.get('/dashboard');
    expect(res.status).toBe(200);
    const f = Object.fromEntries(res.body.funnel.map((x: { stage: string; count: number }) => [x.stage, x.count]));
    expect(f).toMatchObject({ SAVED: 2, APPLIED: 2, REPLIED: 1, INTERVIEW: 1, OFFER: 0 });
    const linkedin = res.body.byChannel.find((r: { key: string }) => r.key === 'LINKEDIN');
    expect(linkedin).toMatchObject({ applied: 1, replied: 1, rate: 100 });
    expect(res.body.weekly).toHaveLength(8);
    expect(res.body.goal.target).toBe(5);
    const blank = (await other.get('/dashboard')).body;
    expect(blank.funnel[0].count).toBe(0);
  });
});

describe('export', () => {
  it('zips JSON, CSV and PDFs with only the user’s own data, and neutralises formulas', async () => {
    await c.post('/applications', { title: '=HYPERLINK("http://evil.example")', company: 'Formula Co' });
    await other.post('/applications', { title: 'Secret Role', company: 'Other Person Co' });
    const job = await c.post('/exports');
    await runQueued();
    const done = (await c.get(`/data-jobs/${job.body.id}`)).body;
    expect(done.status).toBe('DONE');
    expect((await other.get(`/files/${done.fileId}`)).status).toBe(404);
    const zip = await download(c, done.fileId);
    const json = JSON.parse(unzip(zip, 'jobsmith.json'));
    expect(json.format).toBe('jobsmith-export-v1');
    expect(json.applications.map((a: { title: string }) => a.title)).toContain('Data Engineer');
    expect(JSON.stringify(json)).not.toContain('Secret Role');
    expect(JSON.stringify(json)).not.toContain('passwordHash');
    expect(JSON.stringify(json)).not.toContain('icalToken');
    const apps = unzip(zip, 'applications.csv');
    expect(apps).toContain(`'=HYPERLINK`);
    expect(apps).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});
