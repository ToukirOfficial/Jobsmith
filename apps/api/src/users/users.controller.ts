import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { deleteAccountSchema, settingsSchema } from '@jobsmith/shared';
import type { UserContext } from '../common/auth-context.js';
import { CurrentUser } from '../common/decorators.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionService } from '../auth/session.service.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  me(@CurrentUser() user: UserContext) {
    return this.users.me(user.userId);
  }

  @Patch()
  update(@CurrentUser() user: UserContext, @Body({ schema: settingsSchema }) body: z.infer<typeof settingsSchema>) {
    return this.users.updateSettings(user.userId, body);
  }

  @Get('calendar-feed')
  feed(@CurrentUser() user: UserContext) {
    return this.users.calendarFeed(user.userId);
  }

  @Post('calendar-feed/rotate')
  @HttpCode(200)
  rotate(@CurrentUser() user: UserContext) {
    return this.users.rotateCalendarToken(user.userId);
  }

  @Delete()
  async remove(@CurrentUser() user: UserContext, @Body({ schema: deleteAccountSchema }) body: z.infer<typeof deleteAccountSchema>, @Res({ passthrough: true }) res: Response) {
    await this.auth.checkPassword(user.userId, body.password);
    await this.users.deleteAccount(user.userId);
    await this.sessions.end(undefined, res);
    return { ok: true };
  }
}
