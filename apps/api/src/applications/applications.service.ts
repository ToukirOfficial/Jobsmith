import { Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import {
  CONTACT_TYPE_LABELS,
  INTERVIEW_TYPE_LABELS,
  REPLIED_STAGES,
  STAGE_LABELS,
  normaliseCompany,
  normaliseTitle,
  type ApplicationDetail,
  type ApplicationSummary,
  type DuplicateMatch,
  type Page,
  type Stage,
  type TimelineItem,
  type applicationListQuery,
  type applicationSchema,
  type applicationUpdateSchema,
} from '@jobsmith/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import { RedisService } from '../redis.service.js';
import { CompaniesService } from '../companies/companies.service.js';
import { SponsorLookupService } from '../sponsors/sponsor-lookup.service.js';
import { ReminderPlanner } from '../reminders/reminder-planner.js';
import { toContactSummary } from '../contacts/dto.js';
import { toInterviewDto } from '../interviews/dto.js';
import { APPLICATION_INCLUDE, toSummary, type ApplicationRow } from './dto.js';

const notFound = () => new NotFoundException({ message: 'That application could not be found.' });
const dateOrNull = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00Z`) : null);

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly companies: CompaniesService,
    private readonly sponsors: SponsorLookupService,
    private readonly reminders: ReminderPlanner,
  ) {}

  async owned(userId: string, id: string) {
    const a = await this.prisma.application.findFirst({ where: { id, userId } });
    if (!a) throw notFound();
    return a;
  }

  private async summaries(rows: ApplicationRow[]): Promise<ApplicationSummary[]> {
    const badges = await this.sponsors.badges(rows.map((r) => r.company));
    return rows.map((r) => toSummary(r, badges.get(r.company.id)!));
  }

  async list(userId: string, q: z.infer<typeof applicationListQuery>): Promise<Page<ApplicationSummary>> {
    const where: Prisma.ApplicationWhereInput = { userId };
    if (q.archived === 'false') where.archivedAt = null;
    if (q.archived === 'true') where.archivedAt = { not: null };
    if (q.stage.length) where.stage = { in: q.stage };
    if (q.company) where.companyId = q.company;
    if (q.location) where.location = { contains: q.location, mode: 'insensitive' };
    if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lt: new Date(Date.parse(`${q.to}T00:00:00Z`) + 86_400_000) } : {}) };
    if (q.q) {
      where.OR = [
        { title: { contains: q.q, mode: 'insensitive' } },
        { company: { name: { contains: q.q, mode: 'insensitive' } } },
        { location: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    const dir = q.dir;
    const orderBy: Prisma.ApplicationOrderByWithRelationInput[] = {
      updated: [{ updatedAt: dir }],
      created: [{ createdAt: dir }],
      company: [{ company: { name: dir } }],
      title: [{ title: dir }],
      stage: [{ stage: dir }, { position: 'asc' as const }],
      closing: [{ closingDate: { sort: dir, nulls: 'last' as const } }],
      applied: [{ appliedAt: { sort: dir, nulls: 'last' as const } }],
    }[q.sort];
    const rows = await this.prisma.application.findMany({ where, include: APPLICATION_INCLUDE, orderBy: [...orderBy, { id: 'asc' }], take: 1000 });
    let items = await this.summaries(rows);
    // Sponsor status lives in the register, not on the row, so it is filtered after the lookup.
    if (q.sponsor) {
      const want = { yes: ['LICENSED'], no: ['NOT_FOUND', 'POSSIBLE'], unknown: ['UNKNOWN'] }[q.sponsor];
      items = items.filter((i) => want.includes(i.sponsor.status));
    }
    return { items, total: items.length };
  }

  async duplicates(userId: string, company: string, title: string, excludeId?: string): Promise<DuplicateMatch[]> {
    const rows = await this.prisma.application.findMany({
      where: {
        userId,
        archivedAt: null,
        normalizedTitle: normaliseTitle(title),
        company: { normalizedName: normaliseCompany(company) },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      include: { company: { select: { name: true } } },
      take: 5,
    });
    return rows.map((r) => ({ id: r.id, title: r.title, company: r.company.name, stage: r.stage, createdAt: r.createdAt.toISOString() }));
  }

  async create(userId: string, input: z.infer<typeof applicationSchema>): Promise<ApplicationDetail> {
    const id = await this.prisma.$transaction(async (tx) => {
      const company = await this.companies.findOrCreate(userId, input.company, tx);
      const top = await tx.application.aggregate({ where: { userId, stage: input.stage }, _min: { position: true } });
      const app = await tx.application.create({
        data: {
          userId,
          companyId: company.id,
          title: input.title,
          normalizedTitle: normaliseTitle(input.title),
          url: input.url,
          location: input.location,
          workMode: input.workMode,
          salaryMinPence: input.salaryMinPence,
          salaryMaxPence: input.salaryMaxPence,
          currency: input.currency,
          closingDate: dateOrNull(input.closingDate),
          description: input.description,
          notes: input.notes,
          source: input.source,
          stage: input.stage,
          // New cards go to the top of their column.
          position: (top._min.position ?? 1) - 1,
          appliedAt: input.stage === 'SAVED' ? null : new Date(),
        },
      });
      await tx.stageEvent.create({ data: { userId, applicationId: app.id, to: input.stage } });
      await this.reminders.planForApplication(tx, app.id);
      return app.id;
    });
    await this.redis.invalidate(userId);
    return this.get(userId, id);
  }

  async update(userId: string, id: string, input: z.infer<typeof applicationUpdateSchema>): Promise<ApplicationDetail> {
    await this.owned(userId, id);
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.ApplicationUncheckedUpdateInput = {};
      if (input.company !== undefined) data.companyId = (await this.companies.findOrCreate(userId, input.company, tx)).id;
      if (input.title !== undefined) {
        data.title = input.title;
        data.normalizedTitle = normaliseTitle(input.title);
      }
      for (const k of ['url', 'location', 'workMode', 'salaryMinPence', 'salaryMaxPence', 'currency', 'description', 'notes', 'channel'] as const) {
        if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
      }
      if (input.closingDate !== undefined) data.closingDate = dateOrNull(input.closingDate);
      await tx.application.update({ where: { id }, data });
      await this.reminders.planForApplication(tx, id);
    });
    await this.redis.invalidate(userId);
    return this.get(userId, id);
  }

  /** Moves a card to a stage (and a position in that column). Keeps the stage history and reply dates. */
  async changeStage(userId: string, id: string, stage: Stage, position?: number): Promise<ApplicationSummary> {
    const current = await this.owned(userId, id);
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const changed = current.stage !== stage;
      const column = await tx.application.findMany({
        where: { userId, stage, archivedAt: null, NOT: { id } },
        orderBy: [{ position: 'asc' }, { updatedAt: 'desc' }],
        select: { id: true },
      });
      const at = Math.max(0, Math.min(position ?? 0, column.length));
      const ordered = [...column.slice(0, at).map((c) => c.id), id, ...column.slice(at).map((c) => c.id)];
      for (const [i, rowId] of ordered.entries()) {
        if (rowId !== id) await tx.application.update({ where: { id: rowId }, data: { position: i }, select: { id: true } });
      }
      await tx.application.update({
        where: { id },
        data: {
          stage,
          position: at,
          ...(changed ? { stageChangedAt: now } : {}),
          ...(changed && stage !== 'SAVED' && !current.appliedAt ? { appliedAt: now } : {}),
          ...(changed && REPLIED_STAGES.includes(stage) && !current.firstReplyAt ? { firstReplyAt: now } : {}),
        },
      });
      if (changed) {
        await tx.stageEvent.create({ data: { userId, applicationId: id, from: current.stage, to: stage, at: now } });
        await this.reminders.planForApplication(tx, id);
      }
    });
    await this.redis.invalidate(userId);
    const row = await this.prisma.application.findUniqueOrThrow({ where: { id }, include: APPLICATION_INCLUDE });
    return (await this.summaries([row]))[0]!;
  }

  async archive(userId: string, id: string, archived: boolean) {
    await this.owned(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.application.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await this.reminders.planForApplication(tx, id);
    });
    await this.redis.invalidate(userId);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.prisma.application.delete({ where: { id } });
    await this.redis.invalidate(userId);
    return { ok: true };
  }

  async get(userId: string, id: string): Promise<ApplicationDetail> {
    const a = await this.prisma.application.findFirst({
      where: { id, userId },
      include: {
        ...APPLICATION_INCLUDE,
        stageEvents: { orderBy: { at: 'asc' } },
        contacts: { include: { contact: { include: { company: { select: { id: true, name: true } } } } } },
        interviews: { orderBy: [{ startsAt: 'asc' }, { dueAt: 'asc' }], include: { application: { select: { id: true, title: true, company: { select: { name: true } } } } } },
        contactLogs: { orderBy: { at: 'asc' }, include: { contact: { select: { name: true, type: true } } } },
        snapshots: { orderBy: { createdAt: 'asc' } },
        agentRuns: { where: { savedAt: { not: null } }, select: { savedAt: true } },
      },
    });
    if (!a) throw notFound();
    const badge = await this.sponsors.badge(a.company);
    const timeline: TimelineItem[] = [
      { at: a.createdAt.toISOString(), kind: 'created' as const, text: 'Saved the job' },
      ...a.stageEvents.filter((e) => e.from).map((e) => ({ at: e.at.toISOString(), kind: 'stage' as const, text: `Moved from ${STAGE_LABELS[e.from!]} to ${STAGE_LABELS[e.to]}` })),
      ...a.interviews.map((i) => ({
        at: (i.startsAt ?? i.dueAt ?? i.createdAt).toISOString(),
        kind: 'interview' as const,
        text: i.type === 'TAKE_HOME' ? 'Take-home task due' : `${INTERVIEW_TYPE_LABELS[i.type]} interview`,
      })),
      ...a.contactLogs.map((l) => ({
        at: l.at.toISOString(),
        kind: 'contact' as const,
        text: `${l.direction === 'SENT' ? 'Message to' : 'Message from'} ${l.contact.name} (${CONTACT_TYPE_LABELS[l.contact.type].toLowerCase()})`,
      })),
      ...a.snapshots.map((s) => ({ at: s.createdAt.toISOString(), kind: 'snapshot' as const, text: `Sent: ${s.label}` })),
      ...a.agentRuns.map((r) => ({ at: r.savedAt!.toISOString(), kind: 'agent' as const, text: 'Saved the agent’s drafts' })),
    ].sort((x, y) => x.at.localeCompare(y.at));
    const snapRef = (sid: string | null) => {
      const s = sid ? a.snapshots.find((x) => x.id === sid) : undefined;
      return s ? { id: s.id, label: s.label, fileId: s.fileId, createdAt: s.createdAt.toISOString() } : null;
    };
    return {
      ...toSummary(a, badge),
      url: a.url,
      description: a.description,
      notes: a.notes,
      source: a.source,
      stageHistory: a.stageEvents.map((e) => ({ id: e.id, from: e.from, to: e.to, at: e.at.toISOString() })),
      contacts: a.contacts.map((c) => toContactSummary(c.contact)),
      interviews: a.interviews.map(toInterviewDto),
      cvSnapshot: snapRef(a.cvSnapshotId),
      letterSnapshot: snapRef(a.letterSnapshotId),
      timeline,
    };
  }

  async linkContact(userId: string, id: string, contactId: string) {
    await this.owned(userId, id);
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, userId } });
    if (!contact) throw new NotFoundException({ message: 'That contact could not be found.' });
    await this.prisma.applicationContact.upsert({
      where: { applicationId_contactId: { applicationId: id, contactId } },
      create: { applicationId: id, contactId, userId },
      update: {},
    });
    return this.get(userId, id);
  }

  async unlinkContact(userId: string, id: string, contactId: string) {
    await this.owned(userId, id);
    await this.prisma.applicationContact.deleteMany({ where: { applicationId: id, contactId, userId } });
    return this.get(userId, id);
  }
}

