import { Injectable } from '@nestjs/common';
import { INTERVIEW_TYPE_LABELS, addDays, dateKey, zonedTime, type ReminderKind } from '@jobsmith/shared';
import type { Prisma } from '../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;
interface Wanted {
  kind: ReminderKind;
  dueAt: Date;
  title: string;
  dedupeKey: string;
  interviewId?: string;
}

/** Days before a closing date that "closing soon" fires (ASSUMPTIONS.md). */
export const CLOSING_SOON_DAYS = 3;
/** Reminders fire at 09:00 in the user's time zone. */
export const REMINDER_HOUR = 9;

/**
 * Works out which reminders an application should have right now, and makes the database match: new ones
 * are added, ones that no longer apply (and haven't fired) are removed. dedupeKey is unique, so a reminder
 * can never be created twice, and the worker stamps sentAt when it fires, so it fires once.
 */
@Injectable()
export class ReminderPlanner {
  async planForApplication(tx: Tx, applicationId: string) {
    const app = await tx.application.findUnique({
      where: { id: applicationId },
      include: { company: { select: { name: true } }, user: { select: { timeZone: true, followUpDays: true } }, interviews: true },
    });
    if (!app) return;
    const tz = app.user.timeZone;
    const at9 = (day: string) => zonedTime(day, REMINDER_HOUR, 0, tz);
    const label = `${app.title} at ${app.company.name}`;
    const wanted: Wanted[] = [];

    if (!app.archivedAt) {
      // Follow up N days after applying, while still waiting for a reply.
      if (app.stage === 'APPLIED' && app.appliedAt) {
        const day = addDays(dateKey(app.appliedAt, tz), app.user.followUpDays);
        wanted.push({ kind: 'FOLLOW_UP', dueAt: at9(day), title: `Follow up: ${label}`, dedupeKey: `followup:${app.id}:${day}` });
      }
      // Closing soon, while the job is still only saved.
      if (app.stage === 'SAVED' && app.closingDate) {
        const closing = app.closingDate.toISOString().slice(0, 10);
        const day = addDays(closing, -CLOSING_SOON_DAYS);
        wanted.push({ kind: 'CLOSING_SOON', dueAt: at9(day), title: `Closes ${closing}: ${label}`, dedupeKey: `closing:${app.id}:${closing}` });
      }
      for (const i of app.interviews) {
        if (i.completedAt) continue;
        if (i.type === 'TAKE_HOME' && i.dueAt) {
          const day = addDays(dateKey(i.dueAt, tz), -1);
          wanted.push({ kind: 'TAKE_HOME_DUE', dueAt: at9(day), title: `Take-home due tomorrow: ${label}`, dedupeKey: `takehome:${i.id}:${i.dueAt.toISOString()}`, interviewId: i.id });
        } else if (i.startsAt) {
          const day = addDays(dateKey(i.startsAt, tz), -1);
          wanted.push({
            kind: 'INTERVIEW_TOMORROW',
            dueAt: at9(day),
            title: `${INTERVIEW_TYPE_LABELS[i.type]} interview tomorrow: ${label}`,
            dedupeKey: `interview:${i.id}:${i.startsAt.toISOString()}`,
            interviewId: i.id,
          });
        }
      }
    }

    const keys = wanted.map((w) => w.dedupeKey);
    await tx.reminder.deleteMany({ where: { applicationId: app.id, sentAt: null, dedupeKey: { notIn: keys } } });
    for (const w of wanted) {
      await tx.reminder.upsert({
        where: { dedupeKey: w.dedupeKey },
        create: { userId: app.userId, applicationId: app.id, interviewId: w.interviewId ?? null, kind: w.kind, dueAt: w.dueAt, title: w.title, dedupeKey: w.dedupeKey },
        // Only the wording can change; a reminder that already fired keeps its sentAt and never fires again.
        update: { title: w.title },
      });
    }
  }
}
