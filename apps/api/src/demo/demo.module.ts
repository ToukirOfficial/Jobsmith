import { Controller, Get, HttpCode, Module, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { UserContext } from '../common/auth-context.js';
import { ClientIp, CurrentUser, Public } from '../common/decorators.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { CvModule } from '../cv/cv.module.js';
import { DemoService } from './demo.service.js';

@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  /** Demo mode only (404 otherwise): a private, fictional workspace for this visitor, logged in at once. */
  @Public()
  @Post('start')
  @HttpCode(200)
  start(@ClientIp() ip: string | null, @Res({ passthrough: true }) res: Response) {
    return this.demo.start(ip, res);
  }

  @Get('mail')
  mail(@CurrentUser() u: UserContext) {
    return this.demo.mail(u.userId, u.isDemo);
  }
}

@Module({ imports: [AuthModule, UsersModule, CvModule], controllers: [DemoController], providers: [DemoService], exports: [DemoService] })
export class DemoModule {}
