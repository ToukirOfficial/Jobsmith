import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { config } from '../config.js';
import { PrismaService } from '../prisma.service.js';
import type { UserContext } from './auth-context.js';
import { COOKIES, getCookie } from './cookies.js';
import { verifyAccessToken } from './crypto.js';
import { IS_PUBLIC } from './decorators.js';

const notLoggedIn = () => new UnauthorizedException({ code: 'NOT_LOGGED_IN', message: 'Please log in.' });

/**
 * Global guard, deny by default: every route needs a signed-in user unless it is marked @Public().
 * There are no roles in Jobsmith; ownership (userId) is checked in every service query.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest<Request & { auth?: UserContext }>();
    const token = getCookie(req, COOKIES.access);
    const claims = token ? verifyAccessToken(token) : null;
    if (!claims) throw notLoggedIn();
    // Logging out or a password reset revokes the family; its access tokens stop at once.
    const live = await this.prisma.refreshToken.findFirst({
      where: { familyId: claims.fam, userId: claims.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (!live) throw notLoggedIn();
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, name: true, email: true, timeZone: true, isDemo: true, demoExpiresAt: true },
    });
    if (!user) throw notLoggedIn();
    // Demo sessions only work in demo mode, and end when the demo expires.
    if (user.isDemo && (!config().DEMO_MODE || (user.demoExpiresAt && user.demoExpiresAt < new Date()))) throw notLoggedIn();
    req.auth = { userId: user.id, name: user.name, email: user.email, timeZone: user.timeZone, isDemo: user.isDemo, ip: req.ip ?? null };
    return true;
  }
}
