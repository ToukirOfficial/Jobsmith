import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { config } from '../config.js';
import { RedisService } from '../redis.service.js';

export const QUEUES = { mail: 'mail', work: 'work', schedule: 'schedule' } as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Slow work goes to BullMQ (project rule 8); the worker process (worker.ts) runs it. */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();
  /** Test runs keep jobs here instead of Redis queues, and the tests run the processors directly. */
  static readonly testJobs: { queue: QueueName; name: string; data: unknown }[] = [];

  constructor(private readonly redis: RedisService) {}

  queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: this.redis.connection(),
        prefix: `${config().REDIS_PREFIX}:bull`,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 500, removeOnFail: 1000 },
      });
      this.queues.set(name, q);
    }
    return q;
  }

  async add(name: QueueName, job: string, data: unknown, opts: { jobId?: string; delay?: number } = {}) {
    if (config().NODE_ENV === 'test') {
      QueueService.testJobs.push({ queue: name, name: job, data });
      return;
    }
    await this.queue(name).add(job, data, opts);
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
