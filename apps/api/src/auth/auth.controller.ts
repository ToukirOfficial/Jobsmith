import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { changePasswordSchema, loginSchema, resendCodeSchema, resetConfirmSchema, resetRequestSchema, setupSchema, signupSchema, verifyCodeSchema } from '@jobsmith/shared';
import { COOKIES, getCookie } from '../common/cookies.js';
import type { UserContext } from '../common/auth-context.js';
import { ClientIp, CurrentUser, Public } from '../common/decorators.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Get('setup')
  status() {
    return this.auth.setupStatus();
  }

  @Public()
  @Post('setup')
  setup(@Body({ schema: setupSchema }) body: z.infer<typeof setupSchema>, @ClientIp() ip: string | null, @Res({ passthrough: true }) res: Response) {
    return this.auth.setup(body, { ip, res });
  }

  @Public()
  @Post('auth/signup')
  signup(@Body({ schema: signupSchema }) body: z.infer<typeof signupSchema>, @ClientIp() ip: string | null, @Res({ passthrough: true }) res: Response) {
    return this.auth.signup(body, { ip, res });
  }

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  login(@Body({ schema: loginSchema }) body: z.infer<typeof loginSchema>, @ClientIp() ip: string | null, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(body, { ip, res });
  }

  @Public()
  @Post('auth/verify-code')
  @HttpCode(200)
  verify(@Body({ schema: verifyCodeSchema }) body: z.infer<typeof verifyCodeSchema>, @ClientIp() ip: string | null, @Res({ passthrough: true }) res: Response) {
    return this.auth.verifyCode(body.challenge, body.code, { ip, res });
  }

  @Public()
  @Post('auth/resend-code')
  @HttpCode(200)
  resend(@Body({ schema: resendCodeSchema }) body: z.infer<typeof resendCodeSchema>) {
    return this.auth.resendCode(body.challenge);
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = getCookie(req, COOKIES.refresh);
    const userId = token ? await this.sessions.rotate(token, res) : null;
    if (!userId) {
      res.status(401);
      return { statusCode: 401, code: 'NOT_LOGGED_IN', message: 'Please log in.' };
    }
    return { ok: true };
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.end(getCookie(req, COOKIES.refresh), res);
    return { ok: true };
  }

  @Public()
  @Post('auth/reset/request')
  @HttpCode(200)
  resetRequest(@Body({ schema: resetRequestSchema }) body: z.infer<typeof resetRequestSchema>, @ClientIp() ip: string | null) {
    return this.auth.requestReset(body.email, ip);
  }

  @Public()
  @Post('auth/reset/confirm')
  @HttpCode(200)
  resetConfirm(@Body({ schema: resetConfirmSchema }) body: z.infer<typeof resetConfirmSchema>, @ClientIp() ip: string | null) {
    return this.auth.confirmReset(body, ip);
  }

  @Post('me/password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: UserContext, @Body({ schema: changePasswordSchema }) body: z.infer<typeof changePasswordSchema>, @Res({ passthrough: true }) res: Response) {
    return this.auth.changePassword(user.userId, body.currentPassword, body.password, res);
  }
}
