import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const randomCode = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function hmac(input: string): string {
  return createHmac('sha256', config().JWT_SECRET).update(input).digest('base64url');
}

/** Keyed hash for short secrets (6-digit codes) so a database copy can't be brute-forced offline. */
export const keyedHash = (value: string) => createHmac('sha256', config().JWT_SECRET).update(`code:${value}`).digest('hex');

export interface AccessClaims {
  sub: string;
  /** The refresh token's family: revoking the family ends this access token too. */
  fam: string;
  exp: number;
}

/** Minimal HS256 JWT for our own short-lived access tokens. */
export function signAccessToken(sub: string, fam: string, ttlSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const claims: AccessClaims = { sub, fam, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${body}.${hmac(`${header}.${body}`)}`;
}

export function verifyAccessToken(token: string): AccessClaims | null {
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) return null;
  if (!safeEqual(signature, hmac(`${header}.${body}`))) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AccessClaims;
    if (typeof claims.sub !== 'string' || typeof claims.fam !== 'string') return null;
    if (claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Short-lived signed payload (the login challenge between password and code). */
export function signPayload(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  return `${body}.${hmac(`payload.${body}`)}`;
}

export function verifyPayload<T extends Record<string, unknown>>(token: string): T | null {
  const [body, signature] = token.split('.');
  if (!body || !signature || !safeEqual(signature, hmac(`payload.${body}`))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp: number };
    return data.exp * 1000 < Date.now() ? null : data;
  } catch {
    return null;
  }
}

// ---------- AES-256-GCM for users' AI keys (PRD: encrypted at rest, key from env) ----------

function encryptionKey(): Buffer {
  const raw = config().ENCRYPTION_KEY.trim();
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes');
  return key;
}

/** Returns "v1.iv.tag.ciphertext" (base64url parts). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, ct] = stored.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unreadable secret');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
