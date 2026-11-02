import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { UserContext } from './auth-context.js';

export const IS_PUBLIC = 'js:public';

/** No login needed (setup, login, health, the iCal feed). Every other route needs a signed-in user. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): UserContext => {
  const auth = ctx.switchToHttp().getRequest<Request & { auth?: UserContext }>().auth;
  if (!auth) throw new Error('CurrentUser used on a public route');
  return auth;
});

export const ClientIp = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | null => ctx.switchToHttp().getRequest<Request>().ip ?? null,
);
