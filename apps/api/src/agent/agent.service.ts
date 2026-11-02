import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  AGENT_STEPS,
  AI_STEPS,
  STEP_SCHEMAS,
  addDays,
  buildCvDocument,
  checkSalary,
  coverLetterOutput,
  cvDocumentText,
  dateKey,
  formatSalaryRange,
  fullSelection,
  isWeekend,
  keywordExplainOutput,
  matchKeywords,
  messageOutput,
  readJobOutput,
  type AgentRunDto,
  type AgentStepName,
  type ReadJobOutput,
  type agentSaveSchema,
} from '@jobsmith/shared';
import type { z } from 'zod';
import type { AgentRun, AgentStep, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma.service.js';
import { RedisService } from '../redis.service.js';
import { QueueService } from '../jobs/queue.service.js';
import { AiService } from '../ai/ai.service.js';
import { AiError } from '../ai/providers.js';
import { PROMPT_VERSION, renderPrompt } from '../ai/prompts.js';
import { ProfileService } from '../cv/profile.service.js';
import { toVersionDto } from '../cv/cv-versions.service.js';
import { SponsorLookupService } from '../sponsors/sponsor-lookup.service.js';
import { salaryRules } from '../insights/insights.service.js';
import { ReminderPlanner } from '../reminders/reminder-planner.js';

const notFound = () => new NotFoundException({ message: 'That agent run could not be found.' });
const NO_KEY = 'Add an API key in Settings → AI to draft this. Everything else above works without one.';

type RunWithSteps = AgentRun & { steps: AgentStep[]; application: { title: string; company: { name: string } } };

function toDto(r: RunWithSteps): AgentRunDto {
  return {
    id: r.id,
    applicationId: r.applicationId,
    application: { title: r.application.title, company: r.application.company.name },
    status: r.status,
    promptVersion: r.promptVersion,
    replay: r.replay,
    error: r.error,
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    savedAt: r.savedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    steps: [...r.steps]
      .sort((a, b) => a.index - b.index)
      .map((s) => ({
        index: s.index,
        name: s.name as AgentStepName,
        status: s.status,
        output: s.output,
        error: s.error,
        tokensIn: s.tokensIn,
        tokensOut: s.tokensOut,
        startedAt: s.startedAt?.toISOString() ?? null,
        finishedAt: s.finishedAt?.toISOString() ?? null,
      })),
  };
}

const RUN_INCLUDE = { steps: true, application: { select: { title: true, company: { select: { name: true } } } } } as const;

/** A step can report it was skipped (no key) instead of failing. */
class Skip extends Error {}

/**
 * The application agent: seven typed steps in a BullMQ job (project rules: agent runs). Sponsor, salary, CV
 * pick and follow-up never call the AI. Every output is validated against its Zod schema before saving.
 * The agent only prepares: nothing is sent or submitted anywhere (PRD section 5).
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger('Agent');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
    private readonly ai: AiService,
    private readonly profile: ProfileService,
    private readonly sponsors: SponsorLookupService,
    private readonly reminders: ReminderPlanner,
  ) {}

  // ---------- Requests ----------

  async start(userId: string, applicationId: string): Promise<AgentRunDto> {
    const app = await this.prisma.application.findFirst({ where: { id: applicationId, userId }, select: { id: true } });
    if (!app) throw new NotFoundException({ message: 'That application could not be found.' });
    if (await this.prisma.agentRun.findFirst({ where: { applicationId, status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true } })) {
      throw new ConflictException({ code: 'RUN_ACTIVE', message: 'The agent is already working on this application.' });
    }
    const run = await this.prisma.agentRun.create({
      data: { userId, applicationId, promptVersion: PROMPT_VERSION, steps: { create: AGENT_STEPS.map((name, index) => ({ userId, index, name })) } },
      include: RUN_INCLUDE,
    });
    await this.queue.add('work', 'agent', { id: run.id });
    return toDto(run);
  }

  async get(userId: string, id: string): Promise<AgentRunDto> {
    const r = await this.prisma.agentRun.findFirst({ where: { id, userId }, include: RUN_INCLUDE });
    if (!r) throw notFound();
    return toDto(r);
  }

  async listForApplication(userId: string, applicationId: string) {
    if (!(await this.prisma.application.findFirst({ where: { id: applicationId, userId }, select: { id: true } }))) throw new NotFoundException({ message: 'That application could not be found.' });
    const rows = await this.prisma.agentRun.findMany({ where: { userId, applicationId }, include: RUN_INCLUDE, orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map(toDto);
  }

  async rerunStep(userId: string, id: string, index: number): Promise<AgentRunDto> {
    const r = await this.prisma.agentRun.findFirst({ where: { id, userId } });
    if (!r) throw notFound();
    if (r.replay) throw new ConflictException({ message: 'Recorded demo runs can’t be re-run. Try the agent with your own key instead.' });
    if (r.status === 'QUEUED' || r.status === 'RUNNING') throw new ConflictException({ code: 'RUN_ACTIVE', message: 'Wait for the current run to finish.' });
    await this.prisma.$transaction([
      this.prisma.agentStep.update({ where: { runId_index: { runId: id, index } }, data: { status: 'PENDING', error: null } }),
      this.prisma.agentRun.update({ where: { id }, data: { status: 'QUEUED', finishedAt: null } }),
    ]);
    await this.queue.add('work', 'agent', { id });
    return this.get(userId, id);
  }

  /** "Save to application": the user's reviewed and edited results become drafts and the follow-up date. */
  async save(userId: string, id: string, input: z.infer<typeof agentSaveSchema>) {
    const r = await this.prisma.agentRun.findFirst({ where: { id, userId } });
    if (!r) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      const upsert = (kind: 'COVER_LETTER' | 'LINKEDIN_NOTE', body: string) =>
        tx.draft.upsert({ where: { applicationId_kind: { applicationId: r.applicationId, kind } }, create: { userId, applicationId: r.applicationId, kind, body }, update: { body } });
      if (input.coverLetter) await upsert('COVER_LETTER', input.coverLetter);
      if (input.message) await upsert('LINKEDIN_NOTE', input.message);
      if (input.followUpOn) await tx.application.update({ where: { id: r.applicationId }, data: { followUpOn: new Date(`${input.followUpOn}T00:00:00Z`) } });
      await tx.agentRun.update({ where: { id }, data: { savedAt: new Date() } });
      await this.reminders.planForApplication(tx, r.applicationId);
    });
    await this.redis.invalidate(userId);
    return this.get(userId, id);
  }

  /** Live progress: the current state first, then every change, until the run finishes. */
  stream(userId: string, id: string): Observable<{ data: AgentRunDto }> {
    return new Observable((sub) => {
      const conn = this.redis.connection();
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        conn.disconnect();
        sub.complete();
      };
      const push = (run: AgentRunDto) => {
        sub.next({ data: run });
        if (run.status === 'DONE' || run.status === 'FAILED') setTimeout(close, 50);
      };
      conn.on('message', () => {
        this.get(userId, id).then(push, () => close());
      });
      conn
        .subscribe(this.redis.channel(`agent:${id}`))
        .then(() => this.get(userId, id))
        .then(push, (e: unknown) => {
          sub.error(e);
          conn.disconnect();
        });
      const keepAlive = setInterval(() => !closed && this.get(userId, id).then(push, () => close()), 15_000);
      return () => {
        clearInterval(keepAlive);
        closed = true;
        conn.disconnect();
      };
    });
  }

  private async publish(runId: string) {
    await this.redis.client.publish(this.redis.channel(`agent:${runId}`), '1').catch(() => undefined);
  }

  // ---------- Worker ----------

  async process(runId: string) {
    const run = await this.prisma.agentRun.findUnique({ where: { id: runId }, include: { steps: true } });
    if (!run || run.replay || (run.status !== 'QUEUED' && run.status !== 'RUNNING')) return;
    await this.prisma.agentRun.update({ where: { id: runId }, data: { status: 'RUNNING', startedAt: run.startedAt ?? new Date() } });
    await this.publish(runId);
    const ctx = await this.context(run.userId, run.applicationId);
    // Outputs of steps that already ran feed later ones (when one step is re-run).
    const outputs: Partial<Record<AgentStepName, unknown>> = Object.fromEntries(run.steps.filter((s) => s.status === 'DONE').map((s) => [s.name, s.output]));
    for (const step of [...run.steps].sort((a, b) => a.index - b.index)) {
      // RUNNING here means the worker stopped mid-step last time; BullMQ retried the job, so run it again.
      if (step.status !== 'PENDING' && step.status !== 'RUNNING') continue;
      const name = step.name as AgentStepName;
      await this.prisma.agentStep.update({ where: { id: step.id }, data: { status: 'RUNNING', startedAt: new Date(), error: null } });
      await this.publish(runId);
      const input = { applicationId: run.applicationId, promptVersion: PROMPT_VERSION, usesAi: AI_STEPS.includes(name) && ctx.hasKey };
      try {
        const { output, tokensIn, tokensOut } = await this.runStep(name, ctx, outputs);
        const valid = STEP_SCHEMAS[name].parse(output);
        outputs[name] = valid;
        await this.prisma.agentStep.update({ where: { id: step.id }, data: { status: 'DONE', output: valid as Prisma.InputJsonValue, input, tokensIn, tokensOut, finishedAt: new Date() } });
      } catch (e) {
        const skipped = e instanceof Skip;
        const message = skipped || e instanceof AiError ? (e as Error).message : 'This step failed. Try running it again.';
        if (!skipped && !(e instanceof AiError)) this.logger.warn(`Step ${name} failed: ${(e as Error).name}`);
        const t = e as { tokensIn?: number; tokensOut?: number };
        await this.prisma.agentStep.update({ where: { id: step.id }, data: { status: skipped ? 'SKIPPED' : 'FAILED', error: message, input, tokensIn: t.tokensIn ?? 0, tokensOut: t.tokensOut ?? 0, finishedAt: new Date() } });
      }
      await this.publish(runId);
    }
    await this.prisma.agentRun.update({ where: { id: runId }, data: { status: 'DONE', finishedAt: new Date() } });
    await this.publish(runId);
  }

  private async context(userId: string, applicationId: string) {
    const [app, user, profile, versions, hasKey] = await Promise.all([
      this.prisma.application.findUniqueOrThrow({
        where: { id: applicationId },
        include: { company: true, contacts: { include: { contact: true } } },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, styleNote: true, workAuthNotes: true, timeZone: true, followUpDays: true } }),
      this.profile.get(userId),
      this.prisma.cvVersion.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.ai.hasKey(userId),
    ]);
    return { userId, app, user, profile, versions: versions.map(toVersionDto), hasKey, jobText: [app.title, app.description ?? ''].join('\n') };
  }

  private async runStep(name: AgentStepName, ctx: Awaited<ReturnType<AgentService['context']>>, outputs: Partial<Record<AgentStepName, unknown>>): Promise<{ output: unknown; tokensIn: number; tokensOut: number }> {
    const { app, user, profile, userId } = ctx;
    const today = dateKey(new Date(), user.timeZone);
    const none = { tokensIn: 0, tokensOut: 0 };
    const myName = profile.contact.fullName || user.name;
    const managers = app.contacts.map((c) => c.contact);

    switch (name) {
      case 'READ_JOB': {
        if (!ctx.hasKey || !app.description) {
          const m = matchKeywords(ctx.jobText, '');
          const t = app.title.toLowerCase();
          const seniority = /graduate|entry/.test(t) ? 'GRADUATE' : /junior/.test(t) ? 'JUNIOR' : /lead|principal|staff|head/.test(t) ? 'LEAD' : /senior/.test(t) ? 'SENIOR' : 'UNKNOWN';
          const firstSentences = (app.description ?? '').replace(/\s+/g, ' ').split(/(?<=\.)\s/).slice(0, 2).join(' ').slice(0, 600);
          const out: ReadJobOutput = {
            role: app.title,
            seniority,
            mustHave: m.keywords.filter((k) => k.importance !== 'NICE').map((k) => k.term).slice(0, 12),
            niceToHave: m.keywords.filter((k) => k.importance === 'NICE').map((k) => k.term).slice(0, 10),
            salary: formatSalaryRange(app.salaryMinPence, app.salaryMaxPence, app.currency) || null,
            location: app.location,
            closingDate: app.closingDate?.toISOString().slice(0, 10) ?? null,
            summary: firstSentences || `${app.title} at ${app.company.name}.`,
            source: 'SAVED_FIELDS',
          };
          return { output: out, ...none };
        }
        const prompt = renderPrompt('read-job', { today, title: app.title, company: app.company.name, jobText: app.description });
        const r = await this.ai.json(userId, 'agent:read-job', { ...prompt, maxTokens: 900 }, readJobOutput.omit({ source: true }));
        return { output: { ...r.data, source: 'AI' }, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
      }
      case 'SPONSOR_CHECK': {
        const b = await this.sponsors.badge(app.company);
        const note =
          b.status === 'LICENSED'
            ? `${b.sponsorName} is on the Home Office register as licensed to sponsor (${b.routes.join(', ')}). This doesn’t mean this job will sponsor you: check the advert or ask.`
            : b.status === 'NOT_FOUND'
              ? `${app.company.name} wasn’t found on the register of licensed sponsors. It may use a different legal name; check the company page for close matches.`
              : b.status === 'POSSIBLE'
                ? 'A similar name is on the register. Confirm it on the company page.'
                : 'The sponsor register hasn’t been downloaded yet.';
        return { output: { ...b, note }, ...none };
      }
      case 'SALARY_CHECK': {
        const check = checkSalary(salaryRules(), { salaryMinPence: app.salaryMinPence, salaryMaxPence: app.salaryMaxPence, currency: app.currency, onDate: today, workAuthNotes: user.workAuthNotes });
        return { output: { check }, ...none };
      }
      case 'PICK_CV': {
        const read = outputs.READ_JOB as ReadJobOutput | undefined;
        const jobText = [ctx.jobText, read ? `Required: ${read.mustHave.join(', ')}\nNice to have: ${read.niceToHave.join(', ')}` : ''].join('\n');
        const ranked = ctx.versions
          .map((v) => ({ v, m: matchKeywords(jobText, cvDocumentText(buildCvDocument(profile, v))) }))
          .sort((a, b) => b.m.score - a.m.score);
        const best = ranked[0];
        const covered = best ? best.m.keywords.filter((k) => k.covered).map((k) => k.term) : [];
        const missing = best ? best.m.keywords.filter((k) => !k.covered).map((k) => k.term) : [];
        let explanation: string | null = null;
        let tokens = none;
        if (best && ctx.hasKey) {
          try {
            const prompt = renderPrompt('explain-match', { cvName: best.v.name, score: best.m.score, covered: covered.join(', ') || 'none', missing: missing.join(', ') || 'none', summary: read?.summary ?? app.title });
            const r = await this.ai.json(userId, 'agent:explain-match', { ...prompt, maxTokens: 300 }, keywordExplainOutput);
            explanation = r.data.explanation;
            tokens = { tokensIn: r.tokensIn, tokensOut: r.tokensOut };
          } catch {
            // The explanation is a nice extra; the deterministic pick stands without it.
          }
        }
        return {
          output: {
            cvVersionId: best?.v.id ?? null,
            cvVersionName: best?.v.name ?? null,
            score: best?.m.score ?? 0,
            ranking: ranked.map((r) => ({ id: r.v.id, name: r.v.name, score: r.m.score })),
            covered,
            missing,
            explanation,
          },
          ...tokens,
        };
      }
      case 'COVER_LETTER': {
        if (!ctx.hasKey) throw new Skip(NO_KEY);
        const read = outputs.READ_JOB as ReadJobOutput | undefined;
        const manager = managers.find((c) => c.type === 'HIRING_MANAGER');
        const prompt = renderPrompt('cover-letter', {
          name: myName,
          styleNote: user.styleNote ?? 'none',
          profile: this.profileText(ctx, outputs),
          role: read?.role ?? app.title,
          company: app.company.name,
          hiringManager: manager?.name ?? 'Hiring Manager',
          mustHave: read?.mustHave.join(', ') ?? 'not listed',
          jobText: app.description ?? app.title,
        });
        const r = await this.ai.json(userId, 'agent:cover-letter', { ...prompt, maxTokens: 1200 }, coverLetterOutput);
        return { output: r.data, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
      }
      case 'MESSAGE': {
        if (!ctx.hasKey) throw new Skip(NO_KEY);
        const manager = managers.find((c) => c.type === 'HIRING_MANAGER');
        const recruiter = managers.find((c) => c.type === 'RECRUITER');
        const recipient = manager || !recruiter ? 'HIRING_MANAGER' : 'RECRUITER';
        const person = recipient === 'HIRING_MANAGER' ? manager : recruiter;
        const prompt = renderPrompt('message', {
          recipient,
          recipientLabel: recipient === 'HIRING_MANAGER' ? 'hiring manager' : 'recruiter',
          recipientName: person?.name ?? 'unknown',
          name: myName,
          styleNote: user.styleNote ?? 'none',
          role: app.title,
          company: app.company.name,
          profile: this.profileText(ctx, outputs),
          jobText: (outputs.READ_JOB as ReadJobOutput | undefined)?.summary ?? app.description?.slice(0, 3000) ?? app.title,
        });
        const r = await this.ai.json(userId, 'agent:message', { ...prompt, maxTokens: 400 }, messageOutput);
        return { output: { ...r.data, recipient }, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
      }
      case 'FOLLOW_UP': {
        const from = app.appliedAt ? dateKey(app.appliedAt, user.timeZone) : today;
        const closing = app.closingDate?.toISOString().slice(0, 10);
        const base = !app.appliedAt && closing && closing > from ? closing : from;
        let date = addDays(base, user.followUpDays);
        while (isWeekend(date)) date = addDays(date, 1);
        const reason = app.appliedAt
          ? `${user.followUpDays} days after you applied, moved off the weekend if needed.`
          : closing && closing > today
            ? `${user.followUpDays} days after the closing date (${closing}), assuming you apply before then.`
            : `${user.followUpDays} days from today, assuming you apply today.`;
        return { output: { date, reason }, ...none };
      }
    }
  }

  /** The candidate facts the AI may use: the picked CV version if there is one, else the whole profile. */
  private profileText(ctx: Awaited<ReturnType<AgentService['context']>>, outputs: Partial<Record<AgentStepName, unknown>>): string {
    const pick = outputs.PICK_CV as { cvVersionId: string | null } | undefined;
    const version = ctx.versions.find((v) => v.id === pick?.cvVersionId);
    const doc = buildCvDocument(ctx.profile, version ?? { headline: null, summary: null, selection: fullSelection(ctx.profile.items) });
    const lines = [doc.headline, doc.summary, ...doc.sections.flatMap((s) => [`${s.title}:`, ...s.entries.flatMap((e) => [`- ${[e.heading, e.subheading, e.meta, e.inline].filter(Boolean).join(', ')}`, ...e.bullets.map((b) => `  - ${b}`)])])];
    return lines.filter(Boolean).join('\n').slice(0, 8000) || 'The profile is empty.';
  }
}
