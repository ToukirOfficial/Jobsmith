import { Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import type { z } from 'zod';
import { importPreviewSchema, importSchema } from '@jobsmith/shared';
import type { UserContext } from '../common/auth-context.js';
import { CurrentUser } from '../common/decorators.js';
import { TrackerModule } from '../applications/tracker.module.js';
import { CvModule } from '../cv/cv.module.js';
import { DashboardService } from '../dashboard/dashboard.service.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { DataportService } from './dataport.service.js';

@Controller()
export class DataportController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly data: DataportService,
  ) {}

  @Get('dashboard')
  get(@CurrentUser() u: UserContext) {
    return this.dashboard.get(u.userId);
  }

  @Post('imports/preview')
  @HttpCode(200)
  preview(@Body({ schema: importPreviewSchema }) body: z.infer<typeof importPreviewSchema>) {
    return this.data.preview(body.csv);
  }

  @Post('imports')
  import(@CurrentUser() u: UserContext, @Body({ schema: importSchema }) body: z.infer<typeof importSchema>) {
    return this.data.requestImport(u.userId, body.csv, body.mapping);
  }

  @Post('exports')
  export(@CurrentUser() u: UserContext) {
    return this.data.requestExport(u.userId);
  }

  @Get('exports/latest')
  latestExport(@CurrentUser() u: UserContext) {
    return this.data.latest(u.userId, 'EXPORT');
  }
}

@Module({
  imports: [TrackerModule, CvModule],
  controllers: [DataportController],
  providers: [DashboardService, DataportService, RemindersService],
  exports: [DashboardService],
})
export class DataportModule {}
