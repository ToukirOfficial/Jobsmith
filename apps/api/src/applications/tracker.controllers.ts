import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  applicationListQuery,
  applicationSchema,
  applicationUpdateSchema,
  archiveSchema,
  companyUpdateSchema,
  contactLogSchema,
  contactSchema,
  duplicateQuery,
  idParam,
  interviewSchema,
  interviewUpdateSchema,
  linkContactSchema,
  stageChangeSchema,
} from '@jobsmith/shared';
import type { UserContext } from '../common/auth-context.js';
import { CurrentUser } from '../common/decorators.js';
import { CompaniesService } from '../companies/companies.service.js';
import { ContactsService } from '../contacts/contacts.service.js';
import { InterviewsService } from '../interviews/interviews.service.js';
import { ApplicationsService } from './applications.service.js';

const twoIds = z.object({ id: z.uuid('Not found.'), childId: z.uuid('Not found.') });
const searchQuery = z.object({ q: z.string().trim().max(200).optional() });
const upcomingQuery = z.object({ upcoming: z.enum(['true', 'false']).optional() });

/** Every route here needs a signed-in user (global guard); every service query is scoped by their userId. */
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  @Get()
  list(@CurrentUser() u: UserContext, @Query({ schema: applicationListQuery }) q: z.infer<typeof applicationListQuery>) {
    return this.apps.list(u.userId, q);
  }

  @Get('duplicates')
  duplicates(@CurrentUser() u: UserContext, @Query({ schema: duplicateQuery }) q: z.infer<typeof duplicateQuery>) {
    return this.apps.duplicates(u.userId, q.company, q.title, q.excludeId);
  }

  @Post()
  create(@CurrentUser() u: UserContext, @Body({ schema: applicationSchema }) body: z.infer<typeof applicationSchema>) {
    return this.apps.create(u.userId, body);
  }

  @Get(':id')
  get(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.apps.get(u.userId, p.id);
  }

  @Patch(':id')
  update(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: applicationUpdateSchema }) body: z.infer<typeof applicationUpdateSchema>) {
    return this.apps.update(u.userId, p.id, body);
  }

  @Post(':id/stage')
  @HttpCode(200)
  stage(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: stageChangeSchema }) body: z.infer<typeof stageChangeSchema>) {
    return this.apps.changeStage(u.userId, p.id, body.stage, body.position);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: archiveSchema }) body: z.infer<typeof archiveSchema>) {
    return this.apps.archive(u.userId, p.id, body.archived);
  }

  @Delete(':id')
  remove(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.apps.remove(u.userId, p.id);
  }

  @Post(':id/contacts')
  @HttpCode(200)
  link(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: linkContactSchema }) body: z.infer<typeof linkContactSchema>) {
    return this.apps.linkContact(u.userId, p.id, body.contactId);
  }

  @Delete(':id/contacts/:childId')
  unlink(@CurrentUser() u: UserContext, @Param({ schema: twoIds }) p: z.infer<typeof twoIds>) {
    return this.apps.unlinkContact(u.userId, p.id, p.childId);
  }
}

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list(@CurrentUser() u: UserContext) {
    return this.companies.list(u.userId);
  }

  @Get(':id')
  get(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.companies.get(u.userId, p.id);
  }

  @Patch(':id')
  update(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: companyUpdateSchema }) body: z.infer<typeof companyUpdateSchema>) {
    return this.companies.update(u.userId, p.id, body);
  }
}

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(@CurrentUser() u: UserContext, @Query({ schema: searchQuery }) q: z.infer<typeof searchQuery>) {
    return this.contacts.list(u.userId, q.q);
  }

  @Post()
  create(@CurrentUser() u: UserContext, @Body({ schema: contactSchema }) body: z.infer<typeof contactSchema>) {
    return this.contacts.create(u.userId, body);
  }

  @Get(':id')
  get(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.contacts.get(u.userId, p.id);
  }

  @Patch(':id')
  update(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: contactSchema }) body: z.infer<typeof contactSchema>) {
    return this.contacts.update(u.userId, p.id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.contacts.remove(u.userId, p.id);
  }

  @Post(':id/logs')
  addLog(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: contactLogSchema }) body: z.infer<typeof contactLogSchema>) {
    return this.contacts.addLog(u.userId, p.id, body);
  }

  @Delete(':id/logs/:childId')
  removeLog(@CurrentUser() u: UserContext, @Param({ schema: twoIds }) p: z.infer<typeof twoIds>) {
    return this.contacts.removeLog(u.userId, p.id, p.childId);
  }
}

@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  @Get()
  list(@CurrentUser() u: UserContext, @Query({ schema: upcomingQuery }) q: z.infer<typeof upcomingQuery>) {
    return this.interviews.list(u.userId, { upcoming: q.upcoming === 'true' });
  }

  @Post()
  create(@CurrentUser() u: UserContext, @Body({ schema: interviewSchema }) body: z.infer<typeof interviewSchema>) {
    return this.interviews.create(u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: interviewUpdateSchema }) body: z.infer<typeof interviewUpdateSchema>) {
    return this.interviews.update(u.userId, p.id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.interviews.remove(u.userId, p.id);
  }
}
