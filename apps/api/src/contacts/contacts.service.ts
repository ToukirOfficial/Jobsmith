import { Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import type { ContactDetail, ContactSummary, contactLogSchema, contactSchema } from '@jobsmith/shared';
import { PrismaService } from '../prisma.service.js';
import { RedisService } from '../redis.service.js';
import { toContactSummary } from './dto.js';

const notFound = () => new NotFoundException({ message: 'That contact could not be found.' });

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private async owned(userId: string, id: string) {
    const c = await this.prisma.contact.findFirst({ where: { id, userId } });
    if (!c) throw notFound();
    return c;
  }

  /** Ids the caller sends (company, applications) must be their own. */
  private async checkRefs(userId: string, companyId: string | null, applicationIds: string[]) {
    if (companyId && !(await this.prisma.company.findFirst({ where: { id: companyId, userId }, select: { id: true } }))) {
      throw new NotFoundException({ message: 'That company could not be found.', field: 'companyId' });
    }
    if (applicationIds.length) {
      const n = await this.prisma.application.count({ where: { id: { in: applicationIds }, userId } });
      if (n !== new Set(applicationIds).size) throw new NotFoundException({ message: 'That application could not be found.' });
    }
  }

  async list(userId: string, q?: string): Promise<ContactSummary[]> {
    const rows = await this.prisma.contact.findMany({
      where: { userId, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { company: { name: { contains: q, mode: 'insensitive' } } }] } : {}) },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      take: 1000,
    });
    return rows.map(toContactSummary);
  }

  async get(userId: string, id: string): Promise<ContactDetail> {
    const c = await this.prisma.contact.findFirst({
      where: { id, userId },
      include: {
        company: { select: { id: true, name: true } },
        applications: { include: { application: { select: { id: true, title: true, stage: true, company: { select: { name: true } } } } } },
        logs: { orderBy: { at: 'desc' }, include: { application: { select: { id: true, title: true } } } },
      },
    });
    if (!c) throw notFound();
    return {
      ...toContactSummary(c),
      notes: c.notes,
      applications: c.applications.map(({ application: a }) => ({ id: a.id, title: a.title, company: a.company.name, stage: a.stage })),
      logs: c.logs.map((l) => ({ id: l.id, direction: l.direction, channel: l.channel, at: l.at.toISOString(), note: l.note, application: l.application })),
    };
  }

  async create(userId: string, input: z.infer<typeof contactSchema>) {
    const appIds = input.applicationIds ?? [];
    await this.checkRefs(userId, input.companyId, appIds);
    const c = await this.prisma.$transaction(async (tx) => {
      const created = await tx.contact.create({
        data: { userId, companyId: input.companyId, type: input.type, name: input.name, role: input.role, email: input.email, linkedinUrl: input.linkedinUrl, notes: input.notes },
      });
      for (const applicationId of new Set(appIds)) await tx.applicationContact.create({ data: { userId, applicationId, contactId: created.id } });
      return created;
    });
    return this.get(userId, c.id);
  }

  async update(userId: string, id: string, input: z.infer<typeof contactSchema>) {
    await this.owned(userId, id);
    await this.checkRefs(userId, input.companyId, []);
    await this.prisma.contact.update({
      where: { id },
      data: { companyId: input.companyId, type: input.type, name: input.name, role: input.role, email: input.email, linkedinUrl: input.linkedinUrl, notes: input.notes },
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.prisma.contact.delete({ where: { id } });
    await this.redis.invalidate(userId);
    return { ok: true };
  }

  async addLog(userId: string, id: string, input: z.infer<typeof contactLogSchema>) {
    await this.owned(userId, id);
    if (input.applicationId) await this.checkRefs(userId, null, [input.applicationId]);
    await this.prisma.$transaction(async (tx) => {
      await tx.contactLog.create({ data: { userId, contactId: id, applicationId: input.applicationId, direction: input.direction, channel: input.channel, at: new Date(input.at), note: input.note } });
      // A message received about an application counts as the employer's first reply (ASSUMPTIONS.md).
      if (input.direction === 'RECEIVED' && input.applicationId) {
        await tx.application.updateMany({ where: { id: input.applicationId, userId, firstReplyAt: null, appliedAt: { not: null } }, data: { firstReplyAt: new Date(input.at) } });
      }
    });
    await this.redis.invalidate(userId);
    return this.get(userId, id);
  }

  async removeLog(userId: string, id: string, logId: string) {
    await this.owned(userId, id);
    const n = await this.prisma.contactLog.deleteMany({ where: { id: logId, contactId: id, userId } });
    if (!n.count) throw new NotFoundException({ message: 'That message could not be found.' });
    return this.get(userId, id);
  }
}
