import { Injectable } from '@nestjs/common';
import { extractJobOutput, toAnnualPence, type JobDraft } from '@jobsmith/shared';
import { AiService } from './ai.service.js';
import { renderPrompt } from './prompts.js';

/** Save-by-link fallback: when a page has no schema.org JobPosting and the user has a key, the AI reads it. */
@Injectable()
export class JobExtractService {
  constructor(private readonly ai: AiService) {}

  async extract(userId: string, url: string, pageText: string): Promise<JobDraft | null> {
    if (!(await this.ai.hasKey(userId))) return null;
    try {
      const r = await this.ai.json(userId, 'extract-job', { ...renderPrompt('extract-job', { url, jobText: pageText }), maxTokens: 3000 }, extractJobOutput);
      const d = r.data;
      const period = d.salaryPeriod ?? 'YEAR';
      return {
        title: d.title,
        company: d.company,
        location: d.location,
        workMode: d.workMode,
        salaryMinPence: d.salaryMin ? toAnnualPence(d.salaryMin, period) : null,
        salaryMaxPence: d.salaryMax ? toAnnualPence(d.salaryMax, period) : null,
        currency: d.currency?.toUpperCase() ?? null,
        closingDate: d.closingDate,
        description: d.description ?? pageText.slice(0, 60_000),
        url,
        method: 'AI',
      };
    } catch {
      return null;
    }
  }
}
