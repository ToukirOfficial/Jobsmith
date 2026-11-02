import type { InterviewDto } from '@jobsmith/shared';
import type { Interview } from '../generated/prisma/client.js';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toInterviewDto(i: Interview & { application: { id: string; title: string; company: { name: string } } }): InterviewDto {
  return {
    id: i.id,
    applicationId: i.applicationId,
    application: { id: i.application.id, title: i.application.title, company: i.application.company.name },
    type: i.type,
    startsAt: iso(i.startsAt),
    dueAt: iso(i.dueAt),
    durationMins: i.durationMins,
    interviewers: i.interviewers,
    location: i.location,
    prepNotes: i.prepNotes,
    reflections: i.reflections,
    completedAt: iso(i.completedAt),
  };
}
