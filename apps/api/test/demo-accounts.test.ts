import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAllowed } from '../src/seed/guard.js';
import { PASSWORD, anon, as, createUser, startApp, type TestContext } from './helpers.js';

/** Demo accounts (public passwords) must be useless unless the server runs in demo mode. DEMO_MODE is off here. */
let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.app.close());

describe('seed guard', () => {
  it('runs only with DEMO_MODE=true, or --dev outside production', () => {
    expect(seedAllowed({ DEMO_MODE: 'true', NODE_ENV: 'production' }, []).ok).toBe(true);
    expect(seedAllowed({ DEMO_MODE: 'false', NODE_ENV: 'development' }, ['--dev']).ok).toBe(true);
    expect(seedAllowed({ NODE_ENV: 'test' }, ['--dev']).ok).toBe(true);
    expect(seedAllowed({ DEMO_MODE: 'false', NODE_ENV: 'development' }, []).ok).toBe(false);
    expect(seedAllowed({ NODE_ENV: 'production' }, ['--dev']).ok).toBe(false);
    expect(seedAllowed({}, []).ok).toBe(false);
  });
});

describe('demo accounts outside demo mode', () => {
  it('refuse to log in, even with the right password', async () => {
    const demo = await createUser(ctx.prisma, { isDemo: true });
    const res = await anon(ctx).post('/auth/login', { email: demo.email, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']?.toString() ?? '').not.toContain('js_at=');
    // A normal account with the same password still works.
    const normal = await createUser(ctx.prisma);
    expect((await anon(ctx).post('/auth/login', { email: normal.email, password: PASSWORD })).status).toBe(200);
  });

  it('cannot use a session that already exists', async () => {
    const demo = await createUser(ctx.prisma, { isDemo: true });
    const c = await as(ctx, demo.id);
    expect((await c.get('/me')).status).toBe(401);
    expect((await c.get('/applications')).status).toBe(401);
  });
});
