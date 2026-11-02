import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { RedisService } from '../redis.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { QueueService } from '../jobs/queue.service.js';
import { MailService } from '../mail/mail.service.js';

const shared = [PrismaService, RedisService, RateLimitService, QueueService, MailService];

@Global()
@Module({ providers: shared, exports: shared })
export class CommonModule {}
