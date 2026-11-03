import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import type { Response } from 'express';
import { config } from '../config.js';
import { PrismaService } from '../prisma.service.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { randomToken } from '../common/crypto.js';
import { QueueService } from '../jobs/queue.service.js';
import { SessionService } from '../auth/session.service.js';
import { hashPassword } from '../auth/passwords.js';
import { createUserWithDefaults } from '../users/create-user.js';
import { seedJobSearch } from '../seed/job-search.js';
import { UsersService } from '../users/users.service.js';
import { buildCvDocument, type AgentStepName } from '@jobsmith/shared';
import { ProfileService } from '../cv/profile.service.js';
import { toVersionDto } from '../cv/cv-versions.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export const DEMO_TTL_MS = 24 * 3600_000;

/** Sample job pages the demo can "fetch": served from data/demo/jobs, never from the network. */
export const DEMO_JOB_PAGES: Record<string, string> = {
  'https://careers.demo-jobs.example/frontend-engineer': 'frontend-engineer.html',
  'https://careers.demo-jobs.example/data-engineer': 'data-engineer.html',
  'https://careers.demo-jobs.example/platform-engineer': 'platform-engineer.html',
};

export function demoJobPage(url: string): string | null {
  const file = DEMO_JOB_PAGES[url.replace(/\/$/, '')];
  return file ? readFileSync(new URL(`../../../../data/demo/jobs/${file}`, import.meta.url), 'utf8') : null;
}

export interface Recording {
  company: string;
  timings: Record<AgentStepName, number>;
  READ_JOB: unknown;
  PICK_CV_EXPLANATION: string;
  COVER_LETTER: string;
  MESSAGE: { recipient: 'HIRING_MANAGER' | 'RECRUITER'; message: string };
}
let recordings: Recording[] | undefined;
export function demoRecordings(): Recording[] {
  recordings ??= (JSON.parse(readFileSync(new URL('../../../../data/demo/recorded-runs.json', import.meta.url), 'utf8')) as { runs: Recording[] }).runs;
  return recordings;
}

/**
 * Demo mode (PRD section 8): each visitor gets a private copy of a fictional job search, deleted after 24
 * hours together with any key they tried. The host's own AI key is never used: there isn't one.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger('Demo');

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: RateLimitService,
    private readonly sessions: SessionService,
    private readonly queue: QueueService,
    private readonly users: UsersService,
    private readonly profile: ProfileService,
  ) {}

  private demoOnly() {
    if (!config().DEMO_MODE) throw new NotFoundException({ message: 'Not found.' });
  }

  async start(ip: string | null, res: Response) {
    this.demoOnly();
    await this.limits.hit(`demo:start:${ip}`, 8, 3600);
    await this.limits.hit('demo:start:all', 300, 3600);
    const passwordHash = await hashPassword(randomToken(24));
    const user = await this.prisma.$transaction(
      async (tx) => {
        const u = await createUserWithDefaults(tx, { email: `visitor-${randomToken(9).toLowerCase()}@demo.jobsmith.example`, name: 'Alex Morgan', passwordHash, isDemo: true, demoExpiresAt: new Date(Date.now() + DEMO_TTL_MS) });
        await seedJobSearch(tx, u.id);
        await this.snapshots(tx, u.id);
        return u;
      },
      { timeout: 30_000 },
    );
    // A couple of reminder emails land in the demo mail viewer straight away.
    await this.queue.add('schedule', 'reminders', {});
    await this.sessions.start(user.id, res);
    return { ok: true };
  }

  /** Frozen CVs for the applied jobs; their PDFs are rendered by the worker. */
  private async snapshots(tx: Prisma.TransactionClient, userId: string) {
    const profile = await this.profile.get(userId, tx);
    const apps = await tx.application.findMany({ where: { userId, cvVersionId: { not: null } }, include: { cvVersion: true } });
    for (const app of apps) {
      const v = toVersionDto(app.cvVersion!);
      const snap = await tx.snapshot.create({ data: { userId, applicationId: app.id, kind: 'CV', label: `CV: ${v.name}`, content: { doc: buildCvDocument(profile, v), template: v.template, versionName: v.name } as unknown as Prisma.InputJsonValue, createdAt: app.appliedAt ?? app.createdAt } });
      await tx.application.update({ where: { id: app.id }, data: { cvSnapshotId: snap.id } });
      await this.queue.add('pdf', 'snapshot-pdf', { id: snap.id });
    }
  }

  async mail(userId: string, isDemo: boolean) {
    this.demoOnly();
    if (!isDemo) throw new ForbiddenException({ message: 'Only demo visitors have a demo mailbox.' });
    const rows = await this.prisma.demoMail.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((m) => ({ id: m.id, to: m.to, subject: m.subject, text: m.text, createdAt: m.createdAt.toISOString() }));
  }

  /** Worker, hourly: expired demo visitors are deleted with everything they had, including any AI key. */
  async purge(now = new Date()) {
    const expired = await this.prisma.user.findMany({ where: { isDemo: true, demoExpiresAt: { lt: now } }, select: { id: true } });
    for (const u of expired) await this.users.removeUser(u.id);
    if (expired.length) this.logger.log(`Removed ${expired.length} expired demo visitor(s)`);
    return { removed: expired.length };
  }
}
