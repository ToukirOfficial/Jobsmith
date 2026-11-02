import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import type { loginSchema, resetConfirmSchema, setupSchema } from '@jobsmith/shared';
import { config, loginCodesOn } from '../config.js';
import { PrismaService } from '../prisma.service.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { keyedHash, randomCode, randomToken, sha256, signPayload, verifyPayload } from '../common/crypto.js';
import { MailService } from '../mail/mail.service.js';
import { email } from '../mail/templates.js';
import { createUserWithDefaults } from '../users/create-user.js';
import { dummyHash, hashPassword, verifyPassword } from './passwords.js';
import { SessionService } from './session.service.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

type Meta = { ip: string | null; res: Response };
export type LoginResult = { status: 'ok' } | { status: 'code'; challenge: string; email: string };

const invalidLogin = () => new UnauthorizedException({ code: 'INVALID_LOGIN', message: 'That email and password don’t match.' });
const expired = () => new BadRequestException({ code: 'CHALLENGE_EXPIRED', message: 'That code has expired. Please log in again.' });

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly limits: RateLimitService,
  ) {}

  // ---------- First-run setup and sign-up ----------

  async setupStatus() {
    const done = await this.prisma.installState.findUnique({ where: { id: 1 } });
    return { setupNeeded: !done && !config().DEMO_MODE, signupEnabled: config().SIGNUP_ENABLED, demoMode: config().DEMO_MODE };
  }

  /** The very first visitor creates the account. Afterwards setup is closed for good. */
  async setup(input: z.infer<typeof setupSchema>, meta: Meta) {
    if (config().DEMO_MODE) throw new ForbiddenException({ code: 'SETUP_DONE', message: 'Setup is not available in the demo.' });
    await this.limits.hit(`setup:${meta.ip}`, 10, 3600);
    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      // Inserting row id=1 is the lock: a second setup at the same moment fails on the primary key.
      if (await tx.installState.findUnique({ where: { id: 1 } })) {
        throw new ForbiddenException({ code: 'SETUP_DONE', message: 'Jobsmith is already set up. Please log in.' });
      }
      await tx.installState.create({ data: { id: 1, completedAt: new Date() } });
      if (await tx.user.findUnique({ where: { email: input.email } })) throw new ConflictException({ message: 'That email is already in use.' });
      return createUserWithDefaults(tx, { email: input.email, name: input.name, passwordHash });
    });
    await this.sessions.start(user.id, meta.res);
    return { status: 'ok' as const };
  }

  /** Only when SIGNUP_ENABLED=true (one install, several people). */
  async signup(input: z.infer<typeof setupSchema>, meta: Meta): Promise<LoginResult> {
    if (!config().SIGNUP_ENABLED) throw new ForbiddenException({ code: 'SIGNUP_CLOSED', message: 'Sign-up is closed on this Jobsmith.' });
    await this.limits.hit(`signup:${meta.ip}`, 10, 3600);
    if (await this.prisma.user.findUnique({ where: { email: input.email } })) {
      throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'An account with that email already exists. Please log in.', field: 'email' });
    }
    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.installState.upsert({ where: { id: 1 }, create: { id: 1, completedAt: new Date() }, update: {} });
      return createUserWithDefaults(tx, { email: input.email, name: input.name, passwordHash });
    });
    // With email set up, the first code also proves the address belongs to them.
    if (loginCodesOn()) return this.sendLoginCode(user);
    await this.sessions.start(user.id, meta.res);
    return { status: 'ok' };
  }

  // ---------- Login (plus a 6-digit email code when the server can send email) ----------

  async login(input: z.infer<typeof loginSchema>, meta: Meta): Promise<LoginResult> {
    await this.limits.hit(`login:ip:${meta.ip}`, 30, 900);
    await this.limits.hit(`login:email:${sha256(input.email)}`, 10, 900);
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const ok = user ? await verifyPassword(user.passwordHash, input.password) : (await verifyPassword(await dummyHash(), input.password), false);
    if (!user || !ok) throw invalidLogin();
    // Demo accounts have public passwords: they only exist for the public demo.
    if (user.isDemo && !config().DEMO_MODE) throw invalidLogin();
    if (user.isDemo || !loginCodesOn()) {
      await this.sessions.start(user.id, meta.res);
      return { status: 'ok' };
    }
    return this.sendLoginCode(user);
  }

  private async sendLoginCode(user: { id: string; email: string; name: string }): Promise<LoginResult> {
    await this.limits.hit(`code:send:${user.id}`, 5, 900);
    const code = randomCode();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.authCode.updateMany({ where: { userId: user.id, purpose: 'LOGIN', consumedAt: null }, data: { consumedAt: new Date() } });
      return tx.authCode.create({ data: { userId: user.id, purpose: 'LOGIN', codeHash: keyedHash(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) } });
    });
    await this.mail.send({
      to: user.email,
      userId: user.id,
      ...email({
        subject: `${code} is your Jobsmith login code`,
        heading: 'Your login code',
        paragraphs: [`Hello ${user.name},`, `Your code is ${code}. It works for 10 minutes.`, 'If you didn’t try to log in, you can ignore this email.'],
      }),
    });
    return { status: 'code', challenge: signPayload({ cid: row.id, uid: user.id }, 15 * 60), email: user.email };
  }

  async resendCode(challenge: string): Promise<LoginResult> {
    const data = verifyPayload<{ uid: string }>(challenge);
    const user = data ? await this.prisma.user.findUnique({ where: { id: data.uid } }) : null;
    if (!user) throw expired();
    return this.sendLoginCode(user);
  }

  async verifyCode(challenge: string, code: string, meta: Meta) {
    const data = verifyPayload<{ cid: string; uid: string }>(challenge);
    if (!data) throw expired();
    await this.limits.hit(`code:verify:${data.uid}`, 10, 900);
    const row = await this.prisma.authCode.findUnique({ where: { id: data.cid } });
    if (!row || row.userId !== data.uid || row.purpose !== 'LOGIN' || row.consumedAt || row.expiresAt < new Date() || row.attempts >= MAX_CODE_ATTEMPTS) {
      throw expired();
    }
    if (row.codeHash !== keyedHash(code)) {
      await this.prisma.authCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException({ code: 'WRONG_CODE', message: 'That code isn’t right. Check the email and try again.', field: 'code' });
    }
    const claimed = await this.prisma.authCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (claimed.count !== 1) throw expired();
    await this.sessions.start(row.userId, meta.res);
    return { status: 'ok' as const };
  }

  // ---------- Password reset ----------

  /** Always answers the same way, so it can't be used to find out who has an account. */
  async requestReset(address: string, ip: string | null) {
    await this.limits.hit(`reset:ip:${ip}`, 10, 3600);
    await this.limits.hit(`reset:email:${sha256(address)}`, 3, 3600);
    const user = await this.prisma.user.findUnique({ where: { email: address } });
    if (!user || user.isDemo) return { ok: true };
    const token = randomToken(32);
    await this.prisma.authCode.create({ data: { userId: user.id, purpose: 'RESET', codeHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
    await this.mail.send({
      to: user.email,
      userId: user.id,
      ...email({
        subject: 'Reset your Jobsmith password',
        heading: 'Reset your password',
        paragraphs: [`Hello ${user.name},`, 'Use the button below to choose a new password. The link works for 30 minutes.', 'If you didn’t ask for this, you can ignore this email.'],
        button: { label: 'Choose a new password', url: `${config().APP_URL}/reset?token=${token}` },
      }),
    });
    return { ok: true };
  }

  async confirmReset(input: z.infer<typeof resetConfirmSchema>, ip: string | null) {
    await this.limits.hit(`reset:confirm:${ip}`, 20, 3600);
    const row = await this.prisma.authCode.findFirst({ where: { codeHash: sha256(input.token), purpose: 'RESET' } });
    if (!row || row.consumedAt || row.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'RESET_EXPIRED', message: 'That reset link has expired. Please ask for a new one.' });
    }
    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction([
      this.prisma.authCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    ]);
    // A new password logs every device out.
    await this.sessions.revokeAllForUser(row.userId);
    return { ok: true };
  }

  async changePassword(userId: string, current: string, next: string, res: Response) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.isDemo) throw new ForbiddenException({ message: 'The demo password can’t be changed.' });
    if (!(await verifyPassword(user.passwordHash, current))) {
      throw new BadRequestException({ code: 'WRONG_PASSWORD', message: 'Your current password isn’t right.', field: 'currentPassword' });
    }
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
    await this.sessions.revokeAllForUser(userId);
    await this.sessions.start(userId, res);
    return { ok: true };
  }

  async checkPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new BadRequestException({ code: 'WRONG_PASSWORD', message: 'That password isn’t right.', field: 'password' });
    }
    return user;
  }
}
