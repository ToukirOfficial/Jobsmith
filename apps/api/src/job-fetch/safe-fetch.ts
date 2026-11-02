import { BlockList, isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';

/**
 * Fetches a job page the user asked for, following PRD section 5:
 * http/https only (ports 80 and 443), DNS resolved first and every address checked against loopback,
 * private, link-local, carrier-grade NAT and cloud-metadata ranges, then the connection goes to that
 * vetted address (no second lookup, so DNS rebinding can't swap it). At most 3 redirects, each checked
 * again. 10-second deadline for the whole fetch, 2 MB limit, HTML only.
 */
export class FetchError extends Error {
  constructor(
    public code: 'BAD_URL' | 'BLOCKED_ADDRESS' | 'BLOCKED_SITE' | 'TOO_MANY_REDIRECTS' | 'TOO_LARGE' | 'NOT_HTML' | 'TIMEOUT' | 'HTTP_ERROR' | 'NETWORK' | 'ROBOTS',
    message: string,
  ) {
    super(message);
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(net, prefix, 'ipv6');

/** True when an address is safe to connect to (public unicast). */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !blocked.check(ip, 'ipv4');
  if (family === 6) {
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms are judged by their IPv4 address.
    const mapped = /^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return isPublicAddress(mapped[1]!);
    const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
    if (hexMapped) {
      const n = (parseInt(hexMapped[1]!, 16) << 16) | parseInt(hexMapped[2]!, 16);
      return isPublicAddress([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
    }
    return !blocked.check(ip, 'ipv6');
  }
  return false;
}

/** LinkedIn and Indeed forbid scraping: never fetched, the user pastes the job text instead. */
export function isNoFetchSite(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return /(^|\.)linkedin\.com$/.test(h) || /(^|\.)lnkd\.in$/.test(h) || /(^|\.)indeed\.[a-z.]+$/.test(h) || /(^|\.)indeed\.com$/.test(h);
}

/** Parses and checks a user-supplied URL. */
export function checkUrl(raw: string, allowAnyPort = false): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError('BAD_URL', 'That isn’t a valid link.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError('BAD_URL', 'Only http and https links can be fetched.');
  if (url.username || url.password) throw new FetchError('BAD_URL', 'Links with a username or password can’t be fetched.');
  if (!allowAnyPort && url.port && url.port !== '80' && url.port !== '443') throw new FetchError('BLOCKED_ADDRESS', 'Only standard web ports (80 and 443) can be fetched.');
  if (isNoFetchSite(url.hostname)) throw new FetchError('BLOCKED_SITE', 'LinkedIn and Indeed don’t allow automatic fetching. Paste the job text instead.');
  return url;
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: 'html' | 'text';
  userAgent?: string;
  /** Tests only: resolve a hostname. */
  resolve?: (host: string) => Promise<{ address: string; family: number }[]>;
  /** Tests only: decide whether an address may be used. */
  isAllowed?: (ip: string) => boolean;
  /** Tests only: the local test server can't listen on port 80. */
  allowAnyPort?: boolean;
}

export const USER_AGENT = 'JobsmithBot/1.0 (+self-hosted job search tool; fetches one page a user asked for)';

async function vet(url: URL, opts: FetchOptions): Promise<{ address: string; family: number }> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const allowed = opts.isAllowed ?? isPublicAddress;
  let addresses: { address: string; family: number }[];
  if (isIP(host)) addresses = [{ address: host, family: isIP(host) }];
  else {
    try {
      addresses = opts.resolve ? await opts.resolve(host) : await dnsLookup(host, { all: true, verbatim: true });
    } catch {
      throw new FetchError('NETWORK', 'That website couldn’t be found. Check the link.');
    }
  }
  if (!addresses.length) throw new FetchError('NETWORK', 'That website couldn’t be found. Check the link.');
  // Every address must be public: a name that resolves to both public and private is refused.
  if (addresses.some((a) => !allowed(a.address))) throw new FetchError('BLOCKED_ADDRESS', 'That link points to a private or internal address, so it can’t be fetched.');
  return addresses[0]!;
}

function requestOnce(url: URL, ip: { address: string; family: number }, opts: Required<Pick<FetchOptions, 'maxBytes' | 'accept' | 'userAgent'>>, signal: AbortSignal) {
  return new Promise<{ status: number; location?: string; contentType: string; body: string }>((resolve, reject) => {
    // Connect to the vetted address only; the hostname is still used for TLS (SNI and certificate) and the Host header.
    const lookup: LookupFunction = (_host, options, cb) => {
      if ((options as { all?: boolean }).all) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [ip]);
      else cb(null, ip.address, ip.family);
    };
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'GET',
        lookup,
        signal,
        headers: { 'user-agent': opts.userAgent, accept: opts.accept === 'html' ? 'text/html,application/xhtml+xml;q=0.9' : 'text/plain', 'accept-encoding': 'identity' },
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          resolve({ status, location: res.headers.location, contentType, body: '' });
          return;
        }
        const declared = Number(res.headers['content-length'] ?? 0);
        if (declared > opts.maxBytes) {
          res.destroy();
          reject(new FetchError('TOO_LARGE', 'That page is too large to read (over 2 MB).'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            res.destroy();
            reject(new FetchError('TOO_LARGE', 'That page is too large to read (over 2 MB).'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status, contentType, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

export async function safeFetch(raw: string, options: FetchOptions = {}): Promise<{ url: string; html: string; status: number }> {
  const opts = {
    timeoutMs: options.timeoutMs ?? 10_000,
    maxBytes: options.maxBytes ?? 2 * 1024 * 1024,
    maxRedirects: options.maxRedirects ?? 3,
    accept: options.accept ?? 'html',
    userAgent: options.userAgent ?? USER_AGENT,
  };
  const signal = AbortSignal.timeout(opts.timeoutMs);
  let url = checkUrl(raw, options.allowAnyPort);
  try {
    for (let hop = 0; ; hop++) {
      const ip = await vet(url, options);
      const res = await requestOnce(url, ip, opts, signal);
      if (res.location) {
        if (hop >= opts.maxRedirects) throw new FetchError('TOO_MANY_REDIRECTS', 'That link redirects too many times.');
        url = checkUrl(new URL(res.location, url).href, options.allowAnyPort);
        continue;
      }
      if (res.status >= 400) throw new FetchError('HTTP_ERROR', `The website answered with an error (${res.status}). Check the link, or paste the job text.`);
      const type = res.contentType.split(';')[0]!.trim();
      const okType = opts.accept === 'html' ? type === 'text/html' || type === 'application/xhtml+xml' : type.startsWith('text/');
      if (!okType) throw new FetchError('NOT_HTML', 'That link isn’t a web page (it might be a PDF or a download). Paste the job text instead.');
      return { url: url.href, html: res.body, status: res.status };
    }
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (signal.aborted || (err as Error).name === 'AbortError' || (err as Error).name === 'TimeoutError') throw new FetchError('TIMEOUT', 'That website took too long to answer (over 10 seconds).');
    throw new FetchError('NETWORK', 'That page couldn’t be fetched. Check the link, or paste the job text.');
  }
}
