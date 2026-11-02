import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './common/auth.guard.js';
import { CommonModule } from './common/common.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [CommonModule, AuthModule, UsersModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
