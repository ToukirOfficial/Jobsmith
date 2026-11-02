import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import type { applySchema } from '@jobsmith/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import { RedisService } from '../redis.service.js';
import { QueueService } from '../jobs/queue.service.js';
import { ReminderPlanner } from '../reminders/reminder-planner.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { CvVersionsService } from './cv-versions.service.js';
import { PdfJobsService } from './pdf-jobs.service.js';

/**
 * "Mark as applied": records the channel and freezes exactly what was sent. The CV and cover letter are
 * copied into snapshots (content as JSON, plus a PDF rendered from that copy). Nothing in the API can
 * change a snapshot afterwards; later profile or letter edits never reach it (PRD section 5).
 */
@Injectable()
export class ApplyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
    private readonly reminders: ReminderPlanner,
    private readonly apps: ApplicationsService,
    private readonly versions: CvVersionsService,
    private readonly pdf: PdfJobsService,
  ) {}

  async apply(userId: string, id: string, input: z.infer<typeof applySchema>) {
    const app = await this.apps.owned(userId, id);
    if (app.cvSnapshotId || app.letterSnapshotId) {
      throw new ConflictException({ code: 'ALREADY_SENT', message: 'What you sent is already recorded for this application, and it can’t be changed.' });
    }
    const snapshotIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.ApplicationUncheckedUpdateInput = { channel: input.channel };
      if (input.cvVersionId) {
        const { doc, version } = await this.versions.document(userId, input.cvVersionId, tx);
        const snap = await tx.snapshot.create({ data: { userId, applicationId: id, kind: 'CV', label: `CV: ${version.name}`, content: { doc, template: version.template, versionName: version.name } as unknown as Prisma.InputJsonValue } });
        data.cvSnapshotId = snap.id;
        data.cvVersionId = version.id;
        snapshotIds.push(snap.id);
      }
      if (input.attachCoverLetter) {
        const draft = await tx.draft.findUnique({ where: { applicationId_kind: { applicationId: id, kind: 'COVER_LETTER' } } });
        if (draft && draft.userId === userId && draft.body.trim()) {
          const letter = await this.pdf.letterDocument(userId, draft.body, tx);
          const snap = await tx.snapshot.create({ data: { userId, applicationId: id, kind: 'COVER_LETTER', label: 'Cover letter', content: { letter } as unknown as Prisma.InputJsonValue } });
          data.letterSnapshotId = snap.id;
          snapshotIds.push(snap.id);
        }
      }
      const appliedAt = input.appliedOn ? new Date(`${input.appliedOn}T12:00:00Z`) : new Date();
      if (!app.appliedAt) data.appliedAt = appliedAt;
      if (app.stage === 'SAVED') {
        data.stage = 'APPLIED';
        data.stageChangedAt = appliedAt;
        await tx.stageEvent.create({ data: { userId, applicationId: id, from: 'SAVED', to: 'APPLIED', at: appliedAt } });
      }
      await tx.application.update({ where: { id }, data });
      await this.reminders.planForApplication(tx, id);
    });
    for (const sid of snapshotIds) await this.queue.add('work', 'snapshot-pdf', { id: sid });
    await this.redis.invalidate(userId);
    return this.apps.get(userId, id);
  }

  /** The frozen content of a snapshot, for viewing (read-only). */
  async snapshot(userId: string, id: string) {
    const s = await this.prisma.snapshot.findFirst({ where: { id, userId } });
    if (!s) throw new NotFoundException({ message: 'That snapshot could not be found.' });
    return { id: s.id, kind: s.kind, label: s.label, content: s.content, fileId: s.fileId, createdAt: s.createdAt.toISOString() };
  }
}
