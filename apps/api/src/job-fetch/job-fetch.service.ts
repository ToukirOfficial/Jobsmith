import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { JobDraft, JobFetchDto } from '@jobsmith/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { QueueService } from '../jobs/queue.service.js';
import { extractJobPosting, pageTextDraft } from './extract.js';
import { robotsAllows } from './robots.js';
import { FetchError, checkUrl, safeFetch, type FetchOptions } from './safe-fetch.js';

/** Job pages are fetched in the worker (project rule 8); the browser polls for the result. */
@Injectable()
export class JobFetchService {
  private readonly logger = new Logger('JobFetch');
  /** Tests only: overrides for DNS and address checks. */
  static testOptions: FetchOptions = {};

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: RateLimitService,
    private readonly queue: QueueService,
  ) {}

  async request(userId: string, url: string): Promise<JobFetchDto> {
    let checked: URL;
    try {
      checked = checkUrl(url);
    } catch (e) {
      const err = e as FetchError;
      throw new BadRequestException({ code: err.code, message: err.message, field: 'url' });
    }
    await this.limits.hit(`fetch:${userId}`, 60, 3600);
    const row = await this.prisma.jobFetch.create({ data: { userId, url: checked.href } });
    await this.queue.add('work', 'fetch-job', { id: row.id });
    return this.toDto(row);
  }

  async get(userId: string, id: string): Promise<JobFetchDto> {
    const row = await this.prisma.jobFetch.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException({ message: 'That fetch could not be found.' });
    return this.toDto(row);
  }

  private toDto(row: { id: string; status: 'PENDING' | 'DONE' | 'FAILED'; url: string; result: Prisma.JsonValue; error: string | null }): JobFetchDto {
    const r = (row.result ?? {}) as { draft?: JobDraft; errorCode?: string };
    return { id: row.id, status: row.status, url: row.url, draft: r.draft ?? null, error: row.error, errorCode: r.errorCode ?? null };
  }

  /** Runs in the worker. Never logs the page content or the URL's query string. */
  async process(id: string) {
    const row = await this.prisma.jobFetch.findUnique({ where: { id } });
    if (!row || row.status !== 'PENDING') return;
    try {
      const url = new URL(row.url);
      if (!(await this.robotsAllow(url))) throw new FetchError('ROBOTS', 'That website asks tools not to fetch this page. Paste the job text instead.');
      const page = await safeFetch(row.url, JobFetchService.testOptions);
      const draft = extractJobPosting(page.html, page.url) ?? pageTextDraft(page.html, page.url);
      await this.prisma.jobFetch.update({ where: { id }, data: { status: 'DONE', result: { draft } as unknown as Prisma.InputJsonValue } });
    } catch (e) {
      const err = e instanceof FetchError ? e : new FetchError('NETWORK', 'That page couldn’t be read. Paste the job text instead.');
      if (!(e instanceof FetchError)) this.logger.warn(`Fetch failed: ${(e as Error).name}`);
      await this.prisma.jobFetch.update({ where: { id }, data: { status: 'FAILED', error: err.message, result: { errorCode: err.code } } });
    }
  }

  /** robots.txt for our user agent. If it can't be read, fetching is allowed (RFC 9309). */
  private async robotsAllow(url: URL): Promise<boolean> {
    try {
      const robots = await safeFetch(`${url.origin}/robots.txt`, { ...JobFetchService.testOptions, accept: 'text', maxBytes: 512 * 1024, timeoutMs: 5000 });
      return robotsAllows(robots.html, url.pathname + url.search);
    } catch {
      return true;
    }
  }
}
