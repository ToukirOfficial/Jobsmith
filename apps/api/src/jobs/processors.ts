import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MailService, type MailJob } from '../mail/mail.service.js';
import { JobFetchService } from '../job-fetch/job-fetch.service.js';
import { SponsorRegisterService } from '../sponsors/sponsor-register.service.js';
import { PdfJobsService } from '../cv/pdf-jobs.service.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { DataportService } from '../dataport/dataport.service.js';

/**
 * Runs every queued job by name. The worker process calls this; tests call it directly with the jobs
 * collected in QueueService.testJobs.
 */
@Injectable()
export class JobProcessors {
  private readonly logger = new Logger('Jobs');

  constructor(
    private readonly mail: MailService,
    private readonly fetches: JobFetchService,
    private readonly register: SponsorRegisterService,
    private readonly pdf: PdfJobsService,
    private readonly reminders: RemindersService,
    private readonly data: DataportService,
  ) {}

  async run(queue: string, job: Pick<Job, 'name' | 'data'>): Promise<unknown> {
    const data = job.data as Record<string, unknown>;
    switch (`${queue}:${job.name}`) {
      case 'mail:send':
        return this.mail.deliver(job.data as MailJob);
      case 'work:fetch-job':
        return this.fetches.process(String(data['id']));
      case 'work:pdf':
        return this.pdf.process(String(data['id']));
      case 'work:snapshot-pdf':
        return this.pdf.processSnapshot(String(data['id']));
      case 'work:import':
        return this.data.processImport(String(data['id']));
      case 'work:export':
        return this.data.processExport(String(data['id']));
      case 'schedule:cleanup':
        return this.data.cleanup();
      case 'schedule:reminders':
        return this.reminders.sweep();
      case 'schedule:sponsor-register':
        return this.register.update();
      default:
        this.logger.warn(`No processor for ${queue}:${job.name}`);
        return undefined;
    }
  }
}
