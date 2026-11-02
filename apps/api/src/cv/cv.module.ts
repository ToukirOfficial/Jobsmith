import { Body, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, Put } from '@nestjs/common';
import type { z } from 'zod';
import { applySchema, cvVersionSchema, cvVersionUpdateSchema, idParam, profileContactSchema, profileItemSchema, reorderSchema } from '@jobsmith/shared';
import type { UserContext } from '../common/auth-context.js';
import { CurrentUser } from '../common/decorators.js';
import { TrackerModule } from '../applications/tracker.module.js';
import { FilesController } from '../files/files.controller.js';
import { FilesService } from '../files/files.service.js';
import { ApplyService } from './apply.service.js';
import { CvVersionsService } from './cv-versions.service.js';
import { PdfJobsService } from './pdf-jobs.service.js';
import { ProfileService } from './profile.service.js';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() u: UserContext) {
    return this.profile.get(u.userId);
  }

  @Put('contact')
  contact(@CurrentUser() u: UserContext, @Body({ schema: profileContactSchema }) body: z.infer<typeof profileContactSchema>) {
    return this.profile.updateContact(u.userId, body);
  }

  @Post('items')
  create(@CurrentUser() u: UserContext, @Body({ schema: profileItemSchema }) body: z.infer<typeof profileItemSchema>) {
    return this.profile.createItem(u.userId, body);
  }

  @Post('items/reorder')
  @HttpCode(200)
  reorder(@CurrentUser() u: UserContext, @Body({ schema: reorderSchema }) body: z.infer<typeof reorderSchema>) {
    return this.profile.reorder(u.userId, body.ids);
  }

  @Put('items/:id')
  update(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: profileItemSchema }) body: z.infer<typeof profileItemSchema>) {
    return this.profile.updateItem(u.userId, p.id, body);
  }

  @Delete('items/:id')
  remove(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.profile.deleteItem(u.userId, p.id);
  }
}

@Controller('cv-versions')
export class CvVersionsController {
  constructor(
    private readonly versions: CvVersionsService,
    private readonly pdf: PdfJobsService,
  ) {}

  @Get()
  list(@CurrentUser() u: UserContext) {
    return this.versions.list(u.userId);
  }

  @Post()
  create(@CurrentUser() u: UserContext, @Body({ schema: cvVersionSchema }) body: z.infer<typeof cvVersionSchema>) {
    return this.versions.create(u.userId, body);
  }

  @Get(':id')
  get(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.versions.get(u.userId, p.id);
  }

  @Patch(':id')
  update(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: cvVersionUpdateSchema }) body: z.infer<typeof cvVersionUpdateSchema>) {
    return this.versions.update(u.userId, p.id, body);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.versions.duplicate(u.userId, p.id);
  }

  @Delete(':id')
  remove(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.versions.remove(u.userId, p.id);
  }

  @Post(':id/pdf')
  pdfJob(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.pdf.requestCv(u.userId, p.id);
  }
}

@Controller()
export class SentController {
  constructor(
    private readonly apply: ApplyService,
    private readonly pdf: PdfJobsService,
  ) {}

  @Post('applications/:id/apply')
  @HttpCode(200)
  markApplied(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: applySchema }) body: z.infer<typeof applySchema>) {
    return this.apply.apply(u.userId, p.id, body);
  }

  @Get('snapshots/:id')
  snapshot(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.apply.snapshot(u.userId, p.id);
  }

  @Get('data-jobs/:id')
  job(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.pdf.get(u.userId, p.id);
  }
}

@Module({
  imports: [TrackerModule],
  controllers: [ProfileController, CvVersionsController, SentController, FilesController],
  providers: [ProfileService, CvVersionsService, PdfJobsService, ApplyService, FilesService],
  exports: [ProfileService, CvVersionsService, PdfJobsService, FilesService],
})
export class CvModule {}
