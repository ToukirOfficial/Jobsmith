import { Body, Controller, Get, Module, Param, Post } from '@nestjs/common';
import type { z } from 'zod';
import { idParam, jobFetchSchema } from '@jobsmith/shared';
import type { UserContext } from '../common/auth-context.js';
import { CurrentUser } from '../common/decorators.js';
import { JobFetchService } from './job-fetch.service.js';

@Controller('job-fetch')
export class JobFetchController {
  constructor(private readonly fetches: JobFetchService) {}

  @Post()
  request(@CurrentUser() u: UserContext, @Body({ schema: jobFetchSchema }) body: z.infer<typeof jobFetchSchema>) {
    return this.fetches.request(u.userId, body.url);
  }

  @Get(':id')
  get(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.fetches.get(u.userId, p.id);
  }
}

@Module({ controllers: [JobFetchController], providers: [JobFetchService], exports: [JobFetchService] })
export class JobFetchModule {}
