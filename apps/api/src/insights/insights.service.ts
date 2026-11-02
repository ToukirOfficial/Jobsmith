import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { buildCvDocument, checkSalary, cvDocumentText, dateKey, matchKeywords, salaryRulesSchema, type InsightsDto, type SalaryRules } from '@jobsmith/shared';
import { PrismaService } from '../prisma.service.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { ProfileService } from '../cv/profile.service.js';
import { toVersionDto } from '../cv/cv-versions.service.js';

let rules: SalaryRules | undefined;
/** data/uk-salary-rules.json at the repository root, validated on first use. */
export function salaryRules(): SalaryRules {
  rules ??= salaryRulesSchema.parse(JSON.parse(readFileSync(new URL('../../../../data/uk-salary-rules.json', import.meta.url), 'utf8')));
  return rules;
}

/** Deterministic checks for one application: keyword match against each CV version, and the UK salary check. No AI. */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apps: ApplicationsService,
    private readonly profile: ProfileService,
  ) {}

  async forApplication(userId: string, id: string, cvVersionId?: string): Promise<InsightsDto> {
    const app = await this.apps.owned(userId, id);
    const [user, versions, profile] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true, workAuthNotes: true } }),
      this.prisma.cvVersion.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.profile.get(userId),
    ]);
    const jobText = [app.title, app.description ?? ''].join('\n');
    const scored = versions.map((v) => {
      const dto = toVersionDto(v);
      return { id: v.id, name: v.name, match: matchKeywords(jobText, cvDocumentText(buildCvDocument(profile, dto))) };
    });
    const best = [...scored].sort((a, b) => b.match.score - a.match.score)[0];
    const chosen = (cvVersionId && scored.find((s) => s.id === cvVersionId)) || (app.cvVersionId && scored.find((s) => s.id === app.cvVersionId)) || best;
    const salary = checkSalary(salaryRules(), {
      salaryMinPence: app.salaryMinPence,
      salaryMaxPence: app.salaryMaxPence,
      currency: app.currency,
      onDate: dateKey(new Date(), user.timeZone),
      workAuthNotes: user.workAuthNotes,
    });
    return {
      keywords: chosen && app.description ? { ...chosen.match, cvVersionId: chosen.id, cvVersionName: chosen.name } : null,
      versions: scored.map((s) => ({ id: s.id, name: s.name, score: s.match.score })).sort((a, b) => b.score - a.score),
      salary,
      hasDescription: !!app.description,
    };
  }
}
