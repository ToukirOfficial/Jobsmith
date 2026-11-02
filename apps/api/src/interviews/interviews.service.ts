import { Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import type { InterviewDto, interviewSchema, interviewUpdateSchema } from '@jobsmith/shared';
import { PrismaService } from '../prisma.service.js';
import { RedisService } from '../redis.service.js';
import { ReminderPlanner } from '../reminders/reminder-planner.js';
import { toInterviewDto } from './dto.js';

const notFound = () => new NotFoundException({ message: 'That interview could not be found.' });
const INCLUDE = { application: { select: { id: true, title: true, company: { select: { name: true } } } } };
const date = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly reminders: ReminderPlanner,
  ) {}

  private async owned(userId: string, id: string) {
    const i = await this.prisma.interview.findFirst({ where: { id, userId } });
    if (!i) throw notFound();
    return i;
  }

  async list(userId: string, opts: { upcoming?: boolean } = {}): Promise<InterviewDto[]> {
    const since = new Date(Date.now() - 12 * 3600_000);
    const rows = await this.prisma.interview.findMany({
      where: { userId, ...(opts.upcoming ? { completedAt: null, OR: [{ startsAt: { gte: since } }, { dueAt: { gte: since } }] } : {}) },
      include: INCLUDE,
      orderBy: [{ startsAt: 'asc' }, { dueAt: 'asc' }],
      take: 500,
    });
    return rows.map(toInterviewDto);
  }

  async create(userId: string, input: z.infer<typeof interviewSchema>): Promise<InterviewDto> {
    const app = await this.prisma.application.findFirst({ where: { id: input.applicationId, userId }, select: { id: true } });
    if (!app) throw new NotFoundException({ message: 'That application could not be found.' });
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.interview.create({
        data: {
          userId,
          applicationId: app.id,
          type: input.type,
          startsAt: input.type === 'TAKE_HOME' ? null : date(input.startsAt),
          dueAt: input.type === 'TAKE_HOME' ? date(input.dueAt) : null,
          durationMins: input.durationMins,
          interviewers: input.interviewers,
          location: input.location,
          prepNotes: input.prepNotes,
          reflections: input.reflections,
          completedAt: input.completed ? new Date() : null,
        },
        include: INCLUDE,
      });
      await this.reminders.planForApplication(tx, app.id);
      return created;
    });
    await this.redis.invalidate(userId);
    return toInterviewDto(row);
  }

  async update(userId: string, id: string, input: z.infer<typeof interviewUpdateSchema>): Promise<InterviewDto> {
    const current = await this.owned(userId, id);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.interview.update({
        where: { id },
        data: {
          type: input.type,
          startsAt: date(input.startsAt),
          dueAt: date(input.dueAt),
          durationMins: input.durationMins,
          interviewers: input.interviewers,
          location: input.location,
          prepNotes: input.prepNotes,
          reflections: input.reflections,
          ...(input.completed === undefined ? {} : { completedAt: input.completed ? (current.completedAt ?? new Date()) : null }),
        },
        include: INCLUDE,
      });
      await this.reminders.planForApplication(tx, current.applicationId);
      return updated;
    });
    await this.redis.invalidate(userId);
    return toInterviewDto(row);
  }

  async remove(userId: string, id: string) {
    const current = await this.owned(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.interview.delete({ where: { id } });
      await this.reminders.planForApplication(tx, current.applicationId);
    });
    await this.redis.invalidate(userId);
    return { ok: true };
  }
}
