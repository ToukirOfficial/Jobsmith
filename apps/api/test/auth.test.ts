import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORD, as, anon, clearOutbox, createUser, lastEmail, startApp, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.app.close());
beforeEach(clearOutbox);

/** Cookies from a response, as name=value pairs ready to send back. */
function cookiesOf(res: request.Response): Record<string, string> {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const out: Record<string, string> = {};
  for (const c of raw ?? []) {
    const [pair] = c.split(';');
    const i = pair!.indexOf('=');
    out[pair!.slice(0, i)] = pair!.slice(i + 1);
  }
  return out;
}
const CSRF = 'c'.repeat(24);
const refresh = (rt: string | undefined) => request(ctx.http).post('/api/v1/auth/refresh').set('Cookie', `js_rt=${rt}; js_csrf=${CSRF}`).set('x-csrf-token', CSRF);
const me = (at: string | undefined) => request(ctx.http).get('/api/v1/me').set('Cookie', `js_at=${at}`);
const codeFrom = (text: string) => /\b(\d{6})\b/.exec(text)?.[1] ?? '';

describe('health', () => {
  it('answers on /api/v1/health and /api/health without a login', async () => {
    expect((await request(ctx.http).get('/api/v1/health')).body).toEqual({ ok: true });
    expect((await request(ctx.http).get('/api/health')).body).toEqual({ ok: true });
  });
});

describe('first-run setup', () => {
  it('creates the account once, then closes for good', async () => {
    expect((await anon(ctx).get('/setup')).body.setupNeeded).toBe(true);
    const res = await anon(ctx).post('/setup', { name: 'Ada Applicant', email: 'ada@test.example', password: PASSWORD });
    expect(res.status).toBe(201);
    expect(cookiesOf(res)['js_at']).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'ada@test.example' }, include: { profile: true, letterTemplates: true } });
    expect(user.profile?.fullName).toBe('Ada Applicant');
    expect(user.letterTemplates).toHaveLength(1);

    expect((await anon(ctx).get('/setup')).body.setupNeeded).toBe(false);
    const again = await anon(ctx).post('/setup', { name: 'Mallory', email: 'mallory@test.example', password: PASSWORD });
    expect(again.status).toBe(403);
  });

  it('refuses sign-up while SIGNUP_ENABLED is off', async () => {
    const res = await anon(ctx).post('/auth/signup', { name: 'New', email: 'new@test.example', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('validates input and strips unknown fields', async () => {
    const res = await anon(ctx).post('/auth/login', { email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.fields.email).toBeTruthy();
  });
});

describe('login with email code', () => {
  it('asks for a code, then logs in; the code works once', async () => {
    const user = await createUser(ctx.prisma);
    expect((await anon(ctx).post('/auth/login', { email: user.email, password: 'nope-nope-nope' })).status).toBe(401);
    expect((await anon(ctx).post('/auth/login', { email: 'nobody@test.example', password: PASSWORD })).status).toBe(401);

    const first = await anon(ctx).post('/auth/login', { email: user.email, password: PASSWORD });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('code');
    expect(cookiesOf(first)['js_at']).toBeUndefined();
    const code = codeFrom(lastEmail(user.email)!.text);

    const bad = await anon(ctx).post('/auth/verify-code', { challenge: first.body.challenge, code: code === '000000' ? '111111' : '000000' });
    expect(bad.status).toBe(400);

    const ok = await anon(ctx).post('/auth/verify-code', { challenge: first.body.challenge, code });
    expect(ok.status).toBe(200);
    const cookies = cookiesOf(ok);
    expect(cookies['js_at']).toBeTruthy();
    expect((await anon(ctx).post('/auth/verify-code', { challenge: first.body.challenge, code })).status).toBe(400);

    const res = await me(cookies['js_at']);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.icalToken).toBeUndefined();
  });

  it('locks a code after five wrong tries', async () => {
    const user = await createUser(ctx.prisma);
    const first = await anon(ctx).post('/auth/login', { email: user.email, password: PASSWORD });
    const code = codeFrom(lastEmail(user.email)!.text);
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) await anon(ctx).post('/auth/verify-code', { challenge: first.body.challenge, code: wrong });
    expect((await anon(ctx).post('/auth/verify-code', { challenge: first.body.challenge, code })).status).toBe(400);
  });

  it('rate-limits repeated logins for one email', async () => {
    const user = await createUser(ctx.prisma);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await anon(ctx).post('/auth/login', { email: user.email, password: 'wrong-password-x' })).status);
    expect(statuses).toContain(429);
  });
});

describe('refresh tokens', () => {
  async function loggedIn() {
    const user = await createUser(ctx.prisma);
    const first = await anon(ctx).post('/auth/login', { email: user.email, password: PASSWORD });
    const ok = await anon(ctx).post('/auth/verify-code', { challenge: first.body.challenge, code: codeFrom(lastEmail(user.email)!.text) });
    return cookiesOf(ok);
  }

  it('sets httpOnly cookies, never tokens in the body', async () => {
    const user = await createUser(ctx.prisma);
    const first = await anon(ctx).post('/auth/login', { email: user.email, password: PASSWORD });
    const ok = await anon(ctx).post('/auth/verify-code', { challenge: first.body.challenge, code: codeFrom(lastEmail(user.email)!.text) });
    const raw = (ok.headers['set-cookie'] as unknown as string[]).filter((c) => c.startsWith('js_at') || c.startsWith('js_rt'));
    expect(raw).toHaveLength(2);
    for (const c of raw) {
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/SameSite=Lax/i);
    }
    expect(JSON.stringify(ok.body)).not.toMatch(/js_|token/i);
  });

  it('rotates the refresh token and refuses the old one; reuse after the grace window logs everyone out', async () => {
    const c = await loggedIn();
    const r1 = await refresh(c['js_rt']);
    expect(r1.status).toBe(200);
    const c1 = cookiesOf(r1);
    expect(c1['js_rt']).toBeTruthy();
    expect(c1['js_rt']).not.toBe(c['js_rt']);
    expect((await me(c1['js_at'])).status).toBe(200);

    expect((await refresh(c['js_rt'])).status).toBe(401);

    // Pretend the old token was rotated long ago: reuse now revokes the family, so the new one dies too.
    await ctx.prisma.refreshToken.updateMany({ where: { rotatedAt: { not: null } }, data: { rotatedAt: new Date(Date.now() - 60_000) } });
    expect((await refresh(c['js_rt'])).status).toBe(401);
    expect((await refresh(c1['js_rt'])).status).toBe(401);
    expect((await me(c1['js_at'])).status).toBe(401);
  });

  it('logout ends the session at once, access token included', async () => {
    const c = await loggedIn();
    await request(ctx.http).post('/api/v1/auth/logout').set('Cookie', `js_rt=${c['js_rt']}; js_csrf=${CSRF}`).set('x-csrf-token', CSRF);
    expect((await me(c['js_at'])).status).toBe(401);
  });

  it('refuses a forged access token and a missing CSRF header', async () => {
    expect((await me('abc.def.ghi')).status).toBe(401);
    const c = await loggedIn();
    const noCsrf = await request(ctx.http).patch('/api/v1/me').set('Cookie', `js_at=${c['js_at']}; js_csrf=${CSRF}`).send({});
    expect(noCsrf.status).toBe(403);
  });
});

describe('password reset', () => {
  it('sends a link, sets the new password and logs out every session', async () => {
    const user = await createUser(ctx.prisma);
    const client = await as(ctx, user.id);
    expect((await anon(ctx).post('/auth/reset/request', { email: 'nobody@test.example' })).status).toBe(200);
    expect((await anon(ctx).post('/auth/reset/request', { email: user.email })).status).toBe(200);
    const token = /token=([\w-]+)/.exec(lastEmail(user.email)!.text)?.[1];
    expect(token).toBeTruthy();
    expect((await anon(ctx).post('/auth/reset/confirm', { token, password: 'a-brand-new-password' })).status).toBe(200);
    expect((await anon(ctx).post('/auth/reset/confirm', { token, password: 'another-new-password' })).status).toBe(400);
    expect((await client.get('/me')).status).toBe(401);
    expect((await anon(ctx).post('/auth/login', { email: user.email, password: 'a-brand-new-password' })).status).toBe(200);
  });
});

describe('settings and account', () => {
  it('updates settings with validation', async () => {
    const user = await createUser(ctx.prisma);
    const c = await as(ctx, user.id);
    const base = { name: 'Ada', timeZone: 'Europe/London', weeklyTarget: 8, followUpDays: 7, emailReminders: true, targetRoles: ['Backend engineer'], targetLocations: ['London'] };
    const ok = await c.patch('/me', { ...base, isDemo: true, icalToken: 'x' });
    expect(ok.status).toBe(200);
    expect(ok.body.weeklyTarget).toBe(8);
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.isDemo).toBe(false);
    expect((await c.patch('/me', { ...base, timeZone: 'Mars/Olympus' })).status).toBe(400);
  });

  it('deletes the account and all data with the password', async () => {
    const user = await createUser(ctx.prisma);
    const c = await as(ctx, user.id);
    expect((await c.delete('/me', { password: 'wrong-password' })).status).toBe(400);
    expect((await c.delete('/me', { password: PASSWORD })).status).toBe(200);
    expect(await ctx.prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await ctx.prisma.profile.count({ where: { userId: user.id } })).toBe(0);
  });
});
