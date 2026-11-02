import type { ApplicationSummary, SponsorBadge } from '@jobsmith/shared';
import type { Application, Company, Reminder } from '../generated/prisma/client.js';

export const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
export const iso = (d: Date | null) => (d ? d.toISOString() : null);

export type ApplicationRow = Application & { company: Pick<Company, 'id' | 'name' | 'normalizedName' | 'sponsorName'>; reminders?: Pick<Reminder, 'kind' | 'dueAt' | 'title'>[] };

export const APPLICATION_INCLUDE = {
  company: { select: { id: true, name: true, normalizedName: true, sponsorName: true } },
  reminders: { where: { dismissedAt: null, sentAt: null }, orderBy: { dueAt: 'asc' as const }, take: 1, select: { kind: true, dueAt: true, title: true } },
};

/** The one place an application row becomes a response: only listed fields leave the API. */
export function toSummary(a: ApplicationRow, sponsor: SponsorBadge): ApplicationSummary {
  const r = a.reminders?.[0];
  return {
    id: a.id,
    title: a.title,
    company: { id: a.company.id, name: a.company.name },
    location: a.location,
    workMode: a.workMode,
    salaryMinPence: a.salaryMinPence,
    salaryMaxPence: a.salaryMaxPence,
    currency: a.currency,
    closingDate: day(a.closingDate),
    stage: a.stage,
    stageChangedAt: a.stageChangedAt.toISOString(),
    position: a.position,
    channel: a.channel,
    appliedAt: iso(a.appliedAt),
    archivedAt: iso(a.archivedAt),
    sponsor,
    nextReminder: r ? { kind: r.kind, dueAt: r.dueAt.toISOString(), title: r.title } : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
