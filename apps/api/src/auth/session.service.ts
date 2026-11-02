import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { PrismaService } from '../prisma.service.js';
import { ACCESS_TTL_SECONDS, AUTH_PATH, COOKIES, REFRESH_TTL_SECONDS, clearCookie, setCookie } from '../common/cookies.js';
import { randomToken, sha256, signAccessToken } from '../common/crypto.js';

/** A just-rotated token reused by a second tab within this window is refused but not treated as theft. */
const ROTATION_GRACE_MS = 30_000;

/**
 * Rotating refresh tokens, stored as SHA-256 hashes. Reusing an already-rotated token (outside the grace
 * window) revokes the whole family, which logs out whoever stole it.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  private async issue(userId: string, familyId: string, res: Response) {
    const token = randomToken(32);
    await this.prisma.refreshToken.create({
      data: { userId, familyId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000) },
    });
    setCookie(res, COOKIES.access, signAccessToken(userId, familyId, ACCESS_TTL_SECONDS), ACCESS_TTL_SECONDS, '/api');
    setCookie(res, COOKIES.refresh, token, REFRESH_TTL_SECONDS, AUTH_PATH);
  }

  start(userId: string, res: Response) {
    return this.issue(userId, randomUUID(), res);
  }

  /** Returns the user id, or null when the token is unknown, expired, revoked or reused. */
  async rotate(token: string, res: Response): Promise<string | null> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.revokedAt || row.expiresAt < new Date()) return null;
    if (row.rotatedAt) {
      if (Date.now() - row.rotatedAt.getTime() > ROTATION_GRACE_MS) await this.revokeFamily(row.familyId);
      return null;
    }
    const claimed = await this.prisma.refreshToken.updateMany({ where: { id: row.id, rotatedAt: null }, data: { rotatedAt: new Date() } });
    if (claimed.count !== 1) return null;
    await this.issue(row.userId, row.familyId, res);
    return row.userId;
  }

  async end(token: string | undefined, res: Response) {
    if (token) {
      const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
      if (row) await this.revokeFamily(row.familyId);
    }
    clearCookie(res, COOKIES.access, '/api');
    clearCookie(res, COOKIES.refresh, AUTH_PATH);
  }

  revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  revokeAllForUser(userId: string) {
    return this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
