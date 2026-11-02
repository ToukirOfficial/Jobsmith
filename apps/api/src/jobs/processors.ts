import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MailService, type MailJob } from '../mail/mail.service.js';

/**
 * Runs every queued job by name. The worker process calls this; tests call it directly with the jobs
 * collected in QueueService.testJobs.
 */
@Injectable()
export class JobProcessors {
  private readonly logger = new Logger('Jobs');

  constructor(private readonly mail: MailService) {}

  async run(queue: string, job: Pick<Job, 'name' | 'data'>): Promise<unknown> {
    switch (`${queue}:${job.name}`) {
      case 'mail:send':
        return this.mail.deliver(job.data as MailJob);
      default:
        this.logger.warn(`No processor for ${queue}:${job.name}`);
        return undefined;
    }
  }
}
