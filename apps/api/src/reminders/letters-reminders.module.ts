import { Body, Controller, Get, Header, HttpCode, Module, NotFoundException, Param, Patch, Post, Put, Delete, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  calendarQuery,
  draftKindParam,
  draftSchema,
  fromTemplateSchema,
  idParam,
  insightsQuery,
  letterTemplateSchema,
  reminderListQuery,
  reminderUpdateSchema,
} from '@jobsmith/shared';
import type { UserContext } from '../common/auth-context.js';
import { ClientIp, CurrentUser, Public } from '../common/decorators.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { TrackerModule } from '../applications/tracker.module.js';
import { CvModule } from '../cv/cv.module.js';
import { PdfJobsService } from '../cv/pdf-jobs.service.js';
import { InsightsService } from '../insights/insights.service.js';
import { LettersService } from '../letters/letters.service.js';
import { CalendarService } from './calendar.service.js';
import { RemindersService } from './reminders.service.js';

const feedParam = z.object({ file: z.string().regex(/^[A-Za-z0-9_-]{20,64}\.ics$/, 'Not found.') });

@Controller()
export class LettersController {
  constructor(
    private readonly letters: LettersService,
    private readonly pdf: PdfJobsService,
    private readonly insights: InsightsService,
  ) {}

  @Get('letter-templates')
  templates(@CurrentUser() u: UserContext) {
    return this.letters.templates(u.userId);
  }

  @Post('letter-templates')
  createTemplate(@CurrentUser() u: UserContext, @Body({ schema: letterTemplateSchema }) body: z.infer<typeof letterTemplateSchema>) {
    return this.letters.createTemplate(u.userId, body);
  }

  @Put('letter-templates/:id')
  updateTemplate(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: letterTemplateSchema }) body: z.infer<typeof letterTemplateSchema>) {
    return this.letters.updateTemplate(u.userId, p.id, body);
  }

  @Delete('letter-templates/:id')
  deleteTemplate(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.letters.deleteTemplate(u.userId, p.id);
  }

  @Get('applications/:id/drafts')
  drafts(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.letters.drafts(u.userId, p.id);
  }

  @Put('applications/:id/drafts/:kind')
  save(@CurrentUser() u: UserContext, @Param({ schema: draftKindParam }) p: z.infer<typeof draftKindParam>, @Body({ schema: draftSchema }) body: z.infer<typeof draftSchema>) {
    return this.letters.saveDraft(u.userId, p.id, p.kind, body.body);
  }

  @Post('applications/:id/drafts/:kind/from-template')
  @HttpCode(200)
  fromTemplate(@CurrentUser() u: UserContext, @Param({ schema: draftKindParam }) p: z.infer<typeof draftKindParam>, @Body({ schema: fromTemplateSchema }) body: z.infer<typeof fromTemplateSchema>) {
    return this.letters.fromTemplate(u.userId, p.id, p.kind, body.templateId);
  }

  @Post('drafts/:id/pdf')
  draftPdf(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.pdf.requestLetter(u.userId, p.id);
  }

  @Get('applications/:id/insights')
  insightsFor(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Query({ schema: insightsQuery }) q: z.infer<typeof insightsQuery>) {
    return this.insights.forApplication(u.userId, p.id, q.cvVersionId);
  }
}

@Controller()
export class RemindersController {
  constructor(
    private readonly reminders: RemindersService,
    private readonly calendar: CalendarService,
    private readonly limits: RateLimitService,
  ) {}

  @Get('reminders')
  list(@CurrentUser() u: UserContext, @Query({ schema: reminderListQuery }) q: z.infer<typeof reminderListQuery>) {
    return this.reminders.list(u.userId, q.scope);
  }

  @Patch('reminders/:id')
  update(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: reminderUpdateSchema }) body: z.infer<typeof reminderUpdateSchema>) {
    return this.reminders.setDismissed(u.userId, p.id, body.dismissed);
  }

  @Get('calendar')
  events(@CurrentUser() u: UserContext, @Query({ schema: calendarQuery }) q: z.infer<typeof calendarQuery>) {
    const from = new Date(`${q.from}T00:00:00Z`);
    const to = new Date(`${q.to}T00:00:00Z`);
    if (to <= from || to.getTime() - from.getTime() > 120 * 86_400_000) throw new NotFoundException({ message: 'Choose a range of up to 120 days.' });
    return this.calendar.events(u.userId, new Date(from.getTime() - 86_400_000), new Date(to.getTime() + 86_400_000));
  }

  /** Public, but only with the secret token from Settings (rotatable). Rate-limited per IP. */
  @Public()
  @Get('calendar/:file')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'private, max-age=300')
  async feed(@Param({ schema: feedParam }) p: z.infer<typeof feedParam>, @ClientIp() ip: string | null, @Res({ passthrough: true }) res: Response) {
    await this.limits.hit(`ics:${ip}`, 120, 3600);
    res.setHeader('Content-Disposition', 'inline; filename="jobsmith.ics"');
    return this.calendar.ics(p.file.slice(0, -4));
  }
}

@Module({
  imports: [TrackerModule, CvModule],
  controllers: [LettersController, RemindersController],
  providers: [LettersService, InsightsService, RemindersService, CalendarService],
  exports: [InsightsService, LettersService],
})
export class LettersRemindersModule {}
