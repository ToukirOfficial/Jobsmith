import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

export const COOKIES = { access: 'js_at', refresh: 'js_rt' } as const;
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;
export const AUTH_PATH = '/api/v1/auth';

/** Tiny cookie parser (no cookie-parser dependency). */
export function parseCookies(req: Request, _res: Response, next: NextFunction) {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const value = part.slice(i + 1).trim();
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(value);
    } catch {
      out[part.slice(0, i).trim()] = value;
    }
  }
  req.cookies = out;
  next();
}

export const getCookie = (req: Request, name: string): string | undefined =>
  (req.cookies as Record<string, string> | undefined)?.[name];

export function setCookie(res: Response, name: string, value: string, maxAgeSeconds: number, path: string) {
  res.cookie(name, value, { httpOnly: true, secure: config().COOKIE_SECURE, sameSite: 'lax', path, maxAge: maxAgeSeconds * 1000 });
}

export function clearCookie(res: Response, name: string, path: string) {
  res.clearCookie(name, { httpOnly: true, secure: config().COOKIE_SECURE, sameSite: 'lax', path });
}
