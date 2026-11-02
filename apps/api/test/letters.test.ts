import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, startApp, type Client, type TestContext } from './helpers.js';

let ctx: TestContext;
let c: Client;
let other: Client;

beforeAll(async () => {
  ctx = await startApp();
  c = await as(ctx, (await createUser(ctx.prisma, { name: 'Jordan Reyes' })).id);
  other = await as(ctx, (await createUser(ctx.prisma)).id);
});
afterAll(async () => ctx.app.close());

describe('cover letters and messages', () => {
  it('fills a template for an application and keeps drafts per kind', async () => {
    const app = (await c.post('/applications', { title: 'Backend Engineer', company: 'Lattice Works' })).body;
    await c.post('/contacts', { name: 'Sam Ortiz', type: 'HIRING_MANAGER', companyId: app.company.id, applicationIds: [app.id] });
    const t = await c.post('/letter-templates', { name: 'Short', body: 'Dear {hiringManager},\n\nI am applying for {role} at {company}.\n\n{myName}' });
    expect(t.status).toBe(201);
    const d = await c.post(`/applications/${app.id}/drafts/COVER_LETTER/from-template`, { templateId: t.body.id });
    expect(d.body.body).toBe('Dear Sam Ortiz,\n\nI am applying for Backend Engineer at Lattice Works.\n\nJordan Reyes');
    await c.put(`/applications/${app.id}/drafts/LINKEDIN_NOTE`, { body: 'Hi Sam, I just applied.' });
    const drafts = (await c.get(`/applications/${app.id}/drafts`)).body;
    expect(drafts.map((x: { kind: string }) => x.kind).sort()).toEqual(['COVER_LETTER', 'LINKEDIN_NOTE']);

    expect((await other.get(`/applications/${app.id}/drafts`)).status).toBe(404);
    expect((await other.post(`/applications/${app.id}/drafts/COVER_LETTER/from-template`, { templateId: t.body.id })).status).toBe(404);
    expect((await other.put(`/letter-templates/${t.body.id}`, { name: 'x', body: 'y' })).status).toBe(404);
    expect((await other.post(`/drafts/${d.body.id}/pdf`)).status).toBe(404);
  });
});

describe('insights (no AI)', () => {
  it('scores every CV version against the job and checks the salary, guide only', async () => {
    await c.post('/profile/items', { kind: 'SKILLS', data: { group: 'Stack', skills: ['TypeScript', 'React', 'PostgreSQL'] } });
    const v = (await c.post('/cv-versions', { name: 'Web', template: 'MODERN' })).body;
    await c.patch('/me', { name: 'Jordan Reyes', timeZone: 'Europe/London', weeklyTarget: 5, followUpDays: 7, emailReminders: true, targetRoles: [], targetLocations: [], workAuthNotes: 'Graduate visa, new entrant' });
    const app = (
      await c.post('/applications', {
        title: 'Full-stack Developer',
        company: 'Insight Ltd',
        salaryMinPence: 3_500_000,
        salaryMaxPence: 4_500_000,
        description: "What we're looking for\n- TypeScript\n- React\n- Kubernetes\n\nNice to have\n- GraphQL",
      })
    ).body;
    const res = (await c.get(`/applications/${app.id}/insights`)).body;
    expect(res.keywords.cvVersionId).toBe(v.id);
    const by = Object.fromEntries(res.keywords.keywords.map((k: { term: string }) => [k.term, k]));
    expect(by['Kubernetes']).toMatchObject({ importance: 'MUST', covered: false });
    expect(by['TypeScript'].covered).toBe(true);
    expect(res.salary).toMatchObject({ likely: 'NEW_ENTRANT', general: { verdict: 'BELOW' }, newEntrant: { verdict: 'MEETS' } });
    expect(res.salary.sources[0].url).toMatch(/gov\.uk/);
    expect((await other.get(`/applications/${app.id}/insights`)).status).toBe(404);
  });
});
