import { Body, Controller, Get, HttpCode, MessageEvent, Module, Param, Post, Put, Sse } from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { z } from 'zod';
import { agentSaveSchema, aiSettingsSchema, idParam, stepParam } from '@jobsmith/shared';
import type { UserContext } from '../common/auth-context.js';
import { CurrentUser } from '../common/decorators.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { TrackerModule } from '../applications/tracker.module.js';
import { CvModule } from '../cv/cv.module.js';
import { AiService } from '../ai/ai.service.js';
import { AgentService } from './agent.service.js';

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly limits: RateLimitService,
  ) {}

  @Get('settings')
  settings(@CurrentUser() u: UserContext) {
    return this.ai.settings(u.userId);
  }

  @Put('settings')
  update(@CurrentUser() u: UserContext, @Body({ schema: aiSettingsSchema }) body: z.infer<typeof aiSettingsSchema>) {
    return this.ai.update(u.userId, body);
  }

  @Post('test')
  @HttpCode(200)
  async test(@CurrentUser() u: UserContext) {
    await this.limits.hit(`ai-test:${u.userId}`, 10, 600);
    return this.ai.test(u.userId);
  }
}

@Controller()
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly limits: RateLimitService,
  ) {}

  @Post('applications/:id/agent-runs')
  async start(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    await this.limits.hit(`agent:${u.userId}`, u.isDemo ? 10 : 60, 3600);
    return this.agent.start(u.userId, p.id);
  }

  @Get('applications/:id/agent-runs')
  list(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.agent.listForApplication(u.userId, p.id);
  }

  @Get('agent-runs/:id')
  get(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>) {
    return this.agent.get(u.userId, p.id);
  }

  /** Server-Sent Events: the run's state on every change. Owner only (the guard and the service both check). */
  @Sse('agent-runs/:id/stream')
  async stream(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>): Promise<Observable<MessageEvent>> {
    await this.agent.get(u.userId, p.id);
    return this.agent.stream(u.userId, p.id);
  }

  @Post('agent-runs/:id/steps/:index/rerun')
  @HttpCode(200)
  async rerun(@CurrentUser() u: UserContext, @Param({ schema: stepParam }) p: z.infer<typeof stepParam>) {
    await this.limits.hit(`agent:${u.userId}`, u.isDemo ? 10 : 60, 3600);
    return this.agent.rerunStep(u.userId, p.id, p.index);
  }

  @Post('agent-runs/:id/save')
  @HttpCode(200)
  save(@CurrentUser() u: UserContext, @Param({ schema: idParam }) p: z.infer<typeof idParam>, @Body({ schema: agentSaveSchema }) body: z.infer<typeof agentSaveSchema>) {
    return this.agent.save(u.userId, p.id, body);
  }
}

@Module({
  imports: [TrackerModule, CvModule],
  controllers: [AiController, AgentController],
  providers: [AiService, AgentService],
  exports: [AiService, AgentService],
})
export class AgentModule {}
