import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/passwords.js';
import { ACCESS_TTL_SECONDS } from '../src/common/cookies.js';
import { randomToken, sha256, signAccessToken } from '../src/common/crypto.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma.service.js';
import { QueueService } from '../src/jobs/queue.service.js';
import { createUserWithDefaults } from '../src/users/create-user.js';

export const PASSWORD = 'test-password-123';
let passwordHash: Promise<string> | undefined;

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  http: ReturnType<INestApplication['getHttpServer']>;
}

export async function startApp(): Promise<TestContext> {
  const app = await createApp({ logger: false });
  await app.init();
  return { app, prisma: app.get(PrismaService), http: app.getHttpServer() };
}

export const unique = () => randomUUID().slice(0, 8);

export async function createUser(prisma: PrismaService, data: { name?: string; isDemo?: boolean; demoExpiresAt?: Date } = {}) {
  passwordHash ??= hashPassword(PASSWORD);
  const hash = await passwordHash;
  return prisma.$transaction((tx) => createUserWithDefaults(tx, { email: `user-${unique()}@test.example`, name: data.name ?? 'Test User', passwordHash: hash, ...data }));
}

/** An HTTP client logged in as a user (a live session row plus a signed access cookie), sending the CSRF header like the web app. */
export async function as(ctx: TestContext, userId: string) {
  const familyId = randomUUID();
  await ctx.prisma.refreshToken.create({ data: { userId, familyId, tokenHash: sha256(randomToken()), expiresAt: new Date(Date.now() + 3600_000) } });
  const csrf = randomToken(24);
  const headers: Record<string, string> = { Cookie: `js_at=${signAccessToken(userId, familyId, ACCESS_TTL_SECONDS)}; js_csrf=${csrf}`, 'x-csrf-token': csrf };
  const withHeaders = (r: request.Test) => r.set(headers);
  return {
    userId,
    get: (url: string) => withHeaders(request(ctx.http).get(`/api/v1${url}`)),
    post: (url: string, body?: object) => withHeaders(request(ctx.http).post(`/api/v1${url}`)).send(body ?? {}),
    patch: (url: string, body?: object) => withHeaders(request(ctx.http).patch(`/api/v1${url}`)).send(body ?? {}),
    put: (url: string, body?: object) => withHeaders(request(ctx.http).put(`/api/v1${url}`)).send(body ?? {}),
    delete: (url: string, body?: object) => withHeaders(request(ctx.http).delete(`/api/v1${url}`)).send(body ?? {}),
    upload: (url: string) => withHeaders(request(ctx.http).post(`/api/v1${url}`)),
  };
}
export type Client = Awaited<ReturnType<typeof as>>;

/** A plain client with no session (public routes). */
export const anon = (ctx: TestContext) => ({
  get: (url: string) => request(ctx.http).get(`/api/v1${url}`),
  post: (url: string, body?: object) => request(ctx.http).post(`/api/v1${url}`).send(body ?? {}),
});

export const lastEmail = (to?: string) => [...MailService.outbox].reverse().find((m) => !to || m.to === to);
export const clearOutbox = () => {
  MailService.outbox.length = 0;
  QueueService.testJobs.length = 0;
};
