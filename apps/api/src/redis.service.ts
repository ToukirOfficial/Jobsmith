import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { config } from './config.js';

/** One Redis connection. Every key starts with REDIS_PREFIX, so Jobsmith can share a Redis server. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new Redis(config().REDIS_URL, { maxRetriesPerRequest: null, keyPrefix: `${config().REDIS_PREFIX}:` });

  /** A plain connection (no key prefix) for BullMQ and pub/sub. */
  connection() {
    return new Redis(config().REDIS_URL, { maxRetriesPerRequest: null });
  }

  /** The pub/sub channel name for an agent run's progress events. */
  channel(name: string) {
    return `${config().REDIS_PREFIX}:${name}`;
  }

  async cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const hit = await this.client.get(`cache:${key}`);
    if (hit) return JSON.parse(hit) as T;
    const value = await load();
    await this.client.set(`cache:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
    return value;
  }

  /** Drops a user's cached dashboard after any write that changes it. */
  async invalidate(userId: string) {
    await this.client.del(`cache:dashboard:${userId}`);
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
