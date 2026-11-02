import { ForbiddenException, Injectable } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import type { Me, Settings, settingsSchema } from '@jobsmith/shared';
import { config } from '../config.js';
import { PrismaService } from '../prisma.service.js';
import { RedisService } from '../redis.service.js';
import { randomToken } from '../common/crypto.js';

const SETTINGS_SELECT = {
  name: true,
  homeCity: true,
  timeZone: true,
  workAuthNotes: true,
  targetRoles: true,
  targetLocations: true,
  styleNote: true,
  weeklyTarget: true,
  followUpDays: true,
  emailReminders: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async me(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, isDemo: true, ...SETTINGS_SELECT } });
    const { id, email, isDemo, ...settings } = user;
    return { id, name: settings.name, email, isDemo, demoMode: config().DEMO_MODE, mailEnabled: config().MAIL_ENABLED, settings };
  }

  async updateSettings(userId: string, input: z.infer<typeof settingsSchema>): Promise<Settings> {
    const updated = await this.prisma.user.update({ where: { id: userId }, data: input, select: SETTINGS_SELECT });
    await this.redis.invalidate(userId);
    return updated;
  }

  async calendarFeed(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { icalToken: true } });
    return { url: `${config().APP_URL}/api/v1/calendar/${user.icalToken}.ics` };
  }

  async rotateCalendarToken(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { icalToken: randomToken(24) } });
    return this.calendarFeed(userId);
  }

  /** Deletes the account, every row (cascade) and every stored file, at once. */
  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.isDemo) throw new ForbiddenException({ message: 'Demo accounts are deleted automatically after 24 hours.' });
    await this.removeUser(userId);
    return { ok: true };
  }

  async removeUser(userId: string) {
    await this.prisma.user.delete({ where: { id: userId } });
    await rm(path.resolve(config().STORAGE_DIR, userId), { recursive: true, force: true });
    await this.redis.invalidate(userId);
  }
}
