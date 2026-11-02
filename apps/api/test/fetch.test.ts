import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FetchError, checkUrl, isNoFetchSite, isPublicAddress, safeFetch } from '../src/job-fetch/safe-fetch.js';
import { extractJobPosting, pageTextDraft } from '../src/job-fetch/extract.js';
import { robotsAllows } from '../src/job-fetch/robots.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/jobs/${name}`, import.meta.url), 'utf8');

describe('SSRF protection', () => {
  it('blocks private, loopback, link-local, metadata and special ranges', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00:ec2::254', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '64:ff9b::a00:1']) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    // Well-known public addresses (example.com, a CDN), used only to check they are allowed.
    for (const ip of ['93.184.215.14', '151.101.0.81', '2606:4700::6810:84e5']) expect(isPublicAddress(ip), ip).toBe(true); // scan-secrets: allow
  });

  it('refuses non-http schemes, credentials, odd ports and LinkedIn/Indeed', () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'gopher://x', 'javascript:alert(1)', 'http://user:pass@example.com/', 'http://example.com:6379/', 'not a url']) {
      expect(() => checkUrl(url), url).toThrow(FetchError);
    }
    for (const host of ['www.linkedin.com', 'uk.linkedin.com', 'lnkd.in', 'uk.indeed.com', 'www.indeed.co.uk', 'indeed.com']) expect(isNoFetchSite(host), host).toBe(true);
    expect(isNoFetchSite('notlinkedin.com.example')).toBe(false);
    expect(() => checkUrl('https://www.linkedin.com/jobs/view/1')).toThrow(/Paste the job text/);
  });

  it('refuses a hostname that resolves to a private address, or to a mix', async () => {
    await expect(safeFetch('http://internal.example/', { resolve: async () => [{ address: '10.0.0.5', family: 4 }] })).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
    await expect(
      safeFetch('http://mixed.example/', {
        resolve: async () => [
          { address: '93.184.215.14', family: 4 }, // scan-secrets: allow
          { address: '127.0.0.1', family: 4 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
    await expect(safeFetch('http://127.0.0.1/')).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
    await expect(safeFetch('http://[::1]/')).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
    await expect(safeFetch('http://169.254.169.254/latest/meta-data/')).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
  });

  describe('against a local test server', () => {
    let server: http.Server;
    let port: number;
    // The test server is on loopback, so these tests allow 127.0.0.1 and nothing else.
    const opts = () => ({ resolve: async () => [{ address: '127.0.0.1', family: 4 }], isAllowed: (ip: string) => ip === '127.0.0.1' });

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        const p = req.url ?? '/';
        if (p === '/job') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fixture('jsonld-simple.html'));
        if (p.startsWith('/hop/')) {
          const n = Number(p.split('/')[2]);
          return res.writeHead(302, { location: n > 0 ? `/hop/${n - 1}` : '/job' }).end();
        }
        if (p === '/to-private') return res.writeHead(302, { location: 'http://10.0.0.1/admin' }).end();
        if (p === '/to-metadata') return res.writeHead(301, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
        if (p === '/to-file') return res.writeHead(302, { location: 'file:///etc/passwd' }).end();
        if (p === '/pdf') return res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF');
        if (p === '/huge') {
          res.writeHead(200, { 'content-type': 'text/html' });
          const chunk = 'x'.repeat(64 * 1024);
          for (let i = 0; i < 40; i++) res.write(chunk);
          return res.end();
        }
        if (p === '/slow') return void setTimeout(() => res.writeHead(200, { 'content-type': 'text/html' }).end('late'), 3000);
        res.writeHead(404).end();
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      port = (server.address() as AddressInfo).port;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    const local = (path: string) => `http://jobs.test:${port}/${path}`;

    it('only standard ports are allowed', async () => {
      await expect(safeFetch(local('job'), opts())).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
    });

    // The local server can't listen on port 80, so the remaining tests relax only the port rule.
    const relaxed = (path: string, extra: object = {}) => safeFetch(local(path), { ...opts(), allowAnyPort: true, ...extra });

    it('fetches an HTML page and extracts the job', async () => {
      const page = await relaxed('job');
      expect(extractJobPosting(page.html)?.company).toBe('Brightwave Software Ltd');
    });

    it('follows up to 3 redirects, then stops', async () => {
      expect((await relaxed('hop/2')).html).toContain('JobPosting');
      await expect(relaxed('hop/3')).rejects.toMatchObject({ code: 'TOO_MANY_REDIRECTS' });
    });

    it('re-checks every redirect target', async () => {
      await expect(relaxed('to-private')).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
      await expect(relaxed('to-metadata')).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
      await expect(relaxed('to-file')).rejects.toMatchObject({ code: 'BAD_URL' });
    });

    it('accepts HTML only, up to 2 MB, within the time limit', async () => {
      await expect(relaxed('pdf')).rejects.toMatchObject({ code: 'NOT_HTML' });
      await expect(relaxed('huge')).rejects.toMatchObject({ code: 'TOO_LARGE' });
      await expect(relaxed('slow', { timeoutMs: 300 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    });
  });
});

describe('robots.txt', () => {
  const robots = `User-agent: *\nDisallow: /private\nAllow: /private/jobs\n\nUser-agent: BadBot\nDisallow: /\n`;
  it('applies the longest matching rule for our agent', () => {
    expect(robotsAllows(robots, '/jobs/1')).toBe(true);
    expect(robotsAllows(robots, '/private/admin')).toBe(false);
    expect(robotsAllows(robots, '/private/jobs/2')).toBe(true);
    expect(robotsAllows('User-agent: JobsmithBot\nDisallow: /careers\n', '/careers/9')).toBe(false);
    expect(robotsAllows('User-agent: *\nDisallow: /*.pdf$\n', '/a/file.pdf')).toBe(false);
    expect(robotsAllows('', '/anything')).toBe(true);
  });
});

describe('JobPosting extraction from saved pages', () => {
  it('reads a simple JobPosting', () => {
    const d = extractJobPosting(fixture('jsonld-simple.html'), 'https://brightwave.example/jobs/1')!;
    expect(d).toMatchObject({
      method: 'JSON_LD',
      title: 'Full-stack Developer & Mentor',
      company: 'Brightwave Software Ltd',
      location: 'Manchester, Greater Manchester',
      salaryMinPence: 4_200_000,
      salaryMaxPence: 5_000_000,
      currency: 'GBP',
      closingDate: '2026-11-30',
    });
    expect(d.description).toContain('- TypeScript & React');
    expect(d.description).toContain('£42k–£50k');
    expect(d.description).not.toContain('<');
  });

  it('reads a JobPosting inside @graph, with hourly pay and remote work', () => {
    const d = extractJobPosting(fixture('jsonld-graph.html'))!;
    expect(d.title).toBe('Contract React Developer');
    expect(d.company).toBe('Orbit Labs');
    expect(d.workMode).toBe('REMOTE');
    expect(d.currency).toBe('GBP');
    expect(d.salaryMinPence).toBe(30 * 37.5 * 52 * 100);
  });

  it('skips broken blocks and finds the posting in an array with several locations', () => {
    const d = extractJobPosting(fixture('jsonld-array-broken.html'))!;
    expect(d.title).toBe('Backend Engineer (Node.js)');
    expect(d.location).toBe('London; Leeds');
    expect(d.workMode).toBe('HYBRID');
    expect(d.closingDate).toBe('2026-12-15');
  });

  it('falls back to page text when there is no JobPosting, without scripts or styles', () => {
    const html = fixture('no-jsonld.html');
    expect(extractJobPosting(html)).toBeNull();
    const d = pageTextDraft(html, null);
    expect(d.method).toBe('PAGE_TEXT');
    expect(d.title).toBe('TypeScript Engineer');
    expect(d.company).toBe('Saltmarsh Games');
    expect(d.description).toContain('cosy multiplayer games');
    expect(d.description).not.toContain('tracking');
    expect(d.description).not.toContain('color:red');
  });
});
