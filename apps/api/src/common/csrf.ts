import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { COOKIES, getCookie } from './cookies.js';
import { randomToken, safeEqual } from './crypto.js';

/**
 * CSRF protection, double-submit: the API sets a readable `js_csrf` cookie (SameSite=Strict) and the web
 * app copies it into X-CSRF-Token on every request that changes something. Another site can't read the
 * cookie, so it can't send the header. Requests with no session cookie (login, setup, contractor links)
 * have no session to abuse. A request whose Origin isn't our own site is refused outright.
 */
export const CSRF_COOKIE = 'js_csrf';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

const refuse = (res: Response, message: string) => res.status(403).json({ statusCode: 403, code: 'CSRF', message });

export function csrf(req: Request, res: Response, next: NextFunction) {
  let token = getCookie(req, CSRF_COOKIE);
  if (!token || token.length < 20) {
    token = randomToken(24);
    res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: config().COOKIE_SECURE, sameSite: 'strict', path: '/', maxAge: 30 * 24 * 3600 * 1000 });
    (req.cookies as Record<string, string>)[CSRF_COOKIE] = '';
  }
  if (SAFE.has(req.method)) return next();

  const origin = req.get('origin');
  if (origin && origin !== new URL(config().APP_URL).origin) return refuse(res, 'This request didn’t come from Jobsmith.');

  const hasSession = !!getCookie(req, COOKIES.access) || !!getCookie(req, COOKIES.refresh);
  if (!hasSession) return next();
  const sent = req.get('x-csrf-token') ?? '';
  const expected = getCookie(req, CSRF_COOKIE) ?? '';
  if (!expected || !sent || !safeEqual(sent, expected)) return refuse(res, 'Please refresh the page and try again.');
  next();
}
