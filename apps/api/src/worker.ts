import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { config } from './config.js';
import { CommonModule } from './common/common.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { JobProcessors } from './jobs/processors.js';
import { QUEUES, QueueService } from './jobs/queue.service.js';
import { RedisService } from './redis.service.js';
import { PrismaService } from './prisma.service.js';

/** Scheduled jobs, in London time (plan.md deploy notes). */
const SCHEDULES: { id: string; pattern: string; demoOnly?: boolean }[] = [
  // The sponsor register: GOV.UK publishes on working days; we only download when the file changed.
  { id: 'sponsor-register', pattern: '0 3 * * *' },
  // Reminders: each due one is claimed once and emailed if wanted.
  { id: 'reminders', pattern: '*/5 * * * *' },
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

const workers = Object.values(QUEUES).map(
  (name) =>
    new Worker(name, (job) => processors.run(name, job), {
      connection: redis.connection(),
      prefix: `${cfg.REDIS_PREFIX}:bull`,
      concurrency: name === 'mail' ? 4 : 2,
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
// First start: load the sponsor register straight away instead of waiting for 03:00.
const prisma = app.get(PrismaService);
if (!(await prisma.sponsorImport.count({ where: { status: 'DONE' } }))) await schedule.add('sponsor-register', {}, { jobId: 'sponsor-register-first-run' });
logger.log(`Jobsmith worker running (${workers.length} queues, ${SCHEDULES.length} schedules)`);

const stop = async () => {
  await Promise.all(workers.map((w) => w.close()));
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
