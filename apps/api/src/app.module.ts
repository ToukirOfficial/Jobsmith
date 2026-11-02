import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './common/auth.guard.js';
import { CommonModule } from './common/common.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { TrackerModule } from './applications/tracker.module.js';
import { JobFetchModule } from './job-fetch/job-fetch.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { CvModule } from './cv/cv.module.js';
import { LettersRemindersModule } from './reminders/letters-reminders.module.js';
import { DataportModule } from './dataport/dataport.module.js';
import { AgentModule } from './agent/agent.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [CommonModule, AuthModule, UsersModule, TrackerModule, JobFetchModule, CvModule, LettersRemindersModule, DataportModule, AgentModule, JobsModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
