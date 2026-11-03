import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { config } from './config.js';
import { CommonModule } from './common/common.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { JobProcessors } from './jobs/processors.js';
import { QUEUES, QueueService, type QueueName } from './jobs/queue.service.js';
import { RedisService } from './redis.service.js';

/** Scheduled jobs, in London time (plan.md deploy notes). */
const SCHEDULES: { id: string; pattern: string; demoOnly?: boolean }[] = [
  // Reminders: each due one is claimed once and emailed if wanted.
  { id: 'reminders', pattern: '*/5 * * * *' },
  // Expired downloads (exports, one-off PDFs).
  { id: 'cleanup', pattern: '17 * * * *' },
  // Demo only: visitors' private copies (and any key they tried) are deleted 24 hours after they start.
  { id: 'demo-purge', pattern: '7 * * * *', demoOnly: true },
];

@Module({ imports: [CommonModule, JobsModule] })
class WorkerModule {}

const logger = new Logger('Worker');
const cfg = config();
const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['log', 'warn', 'error'] });
app.enableShutdownHooks();
const processors = app.get(JobProcessors);
const redis = app.get(RedisService);
const queues = app.get(QueueService);

/** Jobs at once per queue. Agent runs, PDFs and the register import are heavy: one at a time each. */
const CONCURRENCY: Record<QueueName, number> = { mail: 4, work: 3, agent: 1, pdf: 1, register: 1, schedule: 3 };

const workers = Object.values(QUEUES).map(
  (name) =>
    new Worker(name, (job) => processors.run(name, job), {
      connection: redis.connection(),
      prefix: `${cfg.REDIS_PREFIX}:bull`,
      concurrency: CONCURRENCY[name],
    }),
);
for (const w of workers) w.on('failed', (job, err) => logger.error(`${w.name}:${job?.name} failed: ${err.message}`));

const schedule = queues.queue('schedule');
for (const s of SCHEDULES) {
  if (s.demoOnly && !cfg.DEMO_MODE) {
    await schedule.removeJobScheduler(s.id);
    continue;
  }
  await schedule.upsertJobScheduler(s.id, { pattern: s.pattern, tz: 'Europe/London' }, { name: s.id });
}
// The sponsor register has its own queue (run one at a time, never alongside a PDF). GOV.UK publishes on
// working days; we only download when the file changed. Never imported on start (a big import while
// everything else boots is what ran the server out of memory): only at 04:00, or by hand with
// `pnpm --filter @jobsmith/api sponsors:import` (sponsors/import-cli.ts).
await schedule.removeJobScheduler('sponsor-register');
await queues.queue('register').upsertJobScheduler('sponsor-register', { pattern: '0 4 * * *', tz: 'Europe/London' }, { name: 'import' });
logger.log(`Jobsmith worker running (${workers.length} queues, ${SCHEDULES.length + 1} schedules)`);

const stop = async () => {
  await Promise.all(workers.map((w) => w.close()));
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
