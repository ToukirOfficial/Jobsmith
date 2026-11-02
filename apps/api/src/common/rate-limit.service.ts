import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../redis.service.js';

const tooMany = () =>
  new HttpException(
    { statusCode: 429, code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' },
    HttpStatus.TOO_MANY_REQUESTS,
  );

/** Fixed-window counters in Redis: login, codes, resets, invites and public links. */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<void> {
    const k = `rl:${key}`;
    // The key gets its expiry before it's counted, so a crash can't leave a counter that never expires.
    await this.redis.client.set(k, '0', 'EX', windowSeconds, 'NX');
    if ((await this.redis.client.incr(k)) > limit) throw tooMany();
  }
}
