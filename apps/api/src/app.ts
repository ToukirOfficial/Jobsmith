import 'reflect-metadata';
import { BadRequestException, StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module.js';
import { parseCookies } from './common/cookies.js';
import { csrf } from './common/csrf.js';
import { AllExceptionsFilter } from './common/http-exception.filter.js';

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/** Validation errors: the first message as `message`, and every field's message in `fields`. */
const validationPipe = new StandardSchemaValidationPipe({
  exceptionFactory: (issues) => {
    const fields: Record<string, string> = {};
    for (const issue of issues) {
      const key = (issue.path ?? []).map((s) => String(typeof s === 'object' && s ? (s as { key: unknown }).key : s)).join('.') || '_';
      fields[key] ??= issue.message;
    }
    return new BadRequestException({ code: 'VALIDATION', message: Object.values(fields)[0] ?? 'Please check the form.', fields });
  },
});

export async function createApp(options: { logger?: boolean } = {}) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: options.logger === false ? false : ['log', 'warn', 'error'],
    bodyParser: false,
    abortOnError: false,
  });
  app.disable('x-powered-by');
  // Requests arrive through Next.js (and nginx in production) on the same machine.
  app.set('trust proxy', 'loopback');
  // CSV imports arrive as text in JSON (up to 3 MB); every other route keeps a small limit.
  app.use('/api/v1/imports', json({ limit: '4mb' }));
  app.useBodyParser('json', { limit: '200kb' });
  app.use(securityHeaders, parseCookies, csrf);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(validationPipe);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  return app;
}
