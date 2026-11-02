import { normaliseCompany, normaliseTitle } from '@jobsmith/shared';
import type { PrismaService } from '../src/prisma.service.js';

export interface OwnedRecords {
  applicationId: string;
  companyId: string;
  contactId: string;
  interviewId: string;
}

/** One of everything a user owns, for the isolation tests. Grows with each phase. */
export async function seedOwnedRecords(prisma: PrismaService, userId: string): Promise<OwnedRecords> {
  const company = await prisma.company.create({ data: { userId, name: 'Northwind Analytics', normalizedName: normaliseCompany('Northwind Analytics') } });
  const application = await prisma.application.create({
    data: { userId, companyId: company.id, title: 'Backend Engineer', normalizedTitle: normaliseTitle('Backend Engineer') },
  });
  await prisma.stageEvent.create({ data: { userId, applicationId: application.id, to: 'SAVED' } });
  const contact = await prisma.contact.create({ data: { userId, companyId: company.id, type: 'RECRUITER', name: 'Riley Recruiter' } });
  await prisma.applicationContact.create({ data: { userId, applicationId: application.id, contactId: contact.id } });
  const interview = await prisma.interview.create({ data: { userId, applicationId: application.id, type: 'PHONE_SCREEN', startsAt: new Date(Date.now() + 86_400_000) } });
  return { applicationId: application.id, companyId: company.id, contactId: contact.id, interviewId: interview.id };
}
