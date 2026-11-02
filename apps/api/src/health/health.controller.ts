import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators.js';
import { PrismaService } from '../prisma.service.js';

/** Health checks: /api/v1/health, and /api/health for the server's uptime checks. */
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  private async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  }

  @Public()
  @Get('health')
  health() {
    return this.check();
  }

  @Public()
  @Get('api/health')
  alias() {
    return this.check();
  }
}
