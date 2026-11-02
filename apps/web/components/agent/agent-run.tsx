'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Check, CircleDashed, CircleSlash, ExternalLink, KeyRound, Loader2, RotateCcw, Save, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { AGENT_STEP_LABELS, AI_STEPS, formatSalary, type AgentRunDto, type AgentStepDto, type AgentStepName, type SalaryCheck } from '@jobsmith/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Live updates over Server-Sent Events, with polling as a fallback if the stream can't be held open. */
export function useAgentRun(id: string, initial?: AgentRunDto) {
  const [run, setRun] = useState<AgentRunDto | undefined>(initial);
  const [error, setError] = useState<string | null>(null);
  const active = !run || run.status === 'QUEUED' || run.status === 'RUNNING';

  useEffect(() => {
    if (!active) return;
    let poll: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const startPolling = () => {
      if (poll || closed) return;
      poll = setInterval(() => {
        api<AgentRunDto>(`/agent-runs/${id}`).then(setRun, (e) => setError(errorMessage(e)));
      }, 1200);
    };
    let es: EventSource | undefined;
    try {
      es = new EventSource(`/api/v1/agent-runs/${id}/stream`);
      es.onmessage = (m) => setRun(JSON.parse(m.data as string) as AgentRunDto);
      es.onerror = () => {
        es?.close();
        startPolling();
      };
    } catch {
      startPolling();
    }
    return () => {
      closed = true;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [id, active]);

  return { run, setRun, error };
}

function StatusIcon({ s, ai }: { s: AgentStepDto['status']; ai: boolean }) {
  if (s === 'DONE') return <Check className="size-4" aria-label="Done" />;
  if (s === 'RUNNING') return <Loader2 className="size-4 animate-spin" aria-label="Running" />;
  if (s === 'FAILED') return <TriangleAlert className="size-4" aria-label="Failed" />;
  if (s === 'SKIPPED') return ai ? <KeyRound className="size-4" aria-label="Needs a key" /> : <CircleSlash className="size-4" aria-label="Skipped" />;
  return <CircleDashed className="size-4" aria-label="Waiting" />;
}

const RING: Record<AgentStepDto['status'], string> = {
  PENDING: 'bg-canvas-deep text-ink-soft',
  RUNNING: 'bg-brand text-white shadow-[0_0_0_5px_var(--brand-tint)]',
  DONE: 'bg-ok text-white',
  FAILED: 'bg-bad text-white',
  SKIPPED: 'bg-none-tint text-none',
};

function Chips({ items, tone }: { items: string[]; tone: 'ok' | 'bad' | 'plain' }) {
  if (!items.length) return <span className="text-muted-foreground">None listed</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <li key={x} className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', tone === 'ok' ? 'bg-ok-tint text-ok' : tone === 'bad' ? 'bg-bad-tint text-bad' : 'bg-canvas-deep text-ink')}>
          {x}
        </li>
      ))}
    </ul>
  );
}

interface Edits {
  coverLetter: string;
  message: string;
  followUpOn: string;
}

function Result({ step, edits, setEdits }: { step: AgentStepDto; edits: Edits; setEdits: (e: Edits) => void }) {
  const o = step.output as Record<string, unknown> | null;
  if (!o) return null;
  switch (step.name) {
    case 'READ_JOB':
      return (
        <div className="space-y-3 text-sm">
          <p>{String(o['summary'])}</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="mb-1 text-xs font-semibold text-ink-soft">Must have</dt>
              <dd>
                <Chips items={o['mustHave'] as string[]} tone="plain" />
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-xs font-semibold text-ink-soft">Nice to have</dt>
              <dd>
                <Chips items={o['niceToHave'] as string[]} tone="plain" />
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            {[o['seniority'] !== 'UNKNOWN' ? `Level: ${String(o['seniority']).toLowerCase()}` : null, o['salary'] ? `Salary: ${o['salary']}` : null, o['location'] ? `Location: ${o['location']}` : null, o['closingDate'] ? `Closes ${o['closingDate']}` : null, o['source'] === 'SAVED_FIELDS' ? 'From the saved job details (no AI)' : null]
              .filter(Boolean)
              .join('. ')}
          </p>
        </div>
      );
    case 'SPONSOR_CHECK':
      return (
        <p className="flex gap-2 text-sm">
          {o['status'] === 'LICENSED' ? <BadgeCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden /> : null}
          {String(o['note'])}
        </p>
      );
    case 'SALARY_CHECK': {
      const c = o['check'] as SalaryCheck | null;
      if (!c) return <p className="text-sm text-muted-foreground">No salary rules apply today.</p>;
      return (
        <div className="space-y-2 text-sm">
          <p>{c.message}</p>
          <p className="text-xs text-muted-foreground">
            General {formatSalary(c.general.thresholdPence)}, new entrant {formatSalary(c.newEntrant.thresholdPence)}. Rules from {c.effectiveFrom}. Guide only, check GOV.UK.{' '}
            {c.sources[0] ? (
              <a href={c.sources[0].url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-brand hover:underline">
                Source <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </p>
        </div>
      );
    }
    case 'PICK_CV':
      return (
        <div className="space-y-3 text-sm">
          {o['cvVersionName'] ? (
            <p>
              <span className="font-semibold">{String(o['cvVersionName'])}</span> matches best, with a score of <span className="font-semibold tabular-nums">{String(o['score'])}</span>.
            </p>
          ) : (
            <p className="text-muted-foreground">
              No CV versions yet. <Link href="/app/cv" className="font-semibold text-brand">Make one in the CV builder</Link>.
            </p>
          )}
          {o['explanation'] ? <p className="rounded-md bg-canvas p-3 text-ink-soft">{String(o['explanation'])}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold text-ink-soft">Covered</p>
              <Chips items={o['covered'] as string[]} tone="ok" />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-ink-soft">Missing (only add what’s true)</p>
              <Chips items={o['missing'] as string[]} tone="bad" />
            </div>
          </div>
        </div>
      );
    case 'COVER_LETTER':
      return (
        <div className="space-y-1.5">
          <Textarea rows={14} value={edits.coverLetter} onChange={(e) => setEdits({ ...edits, coverLetter: e.target.value })} aria-label="Cover letter draft" />
          <p className="text-xs text-muted-foreground">Edit freely. Check every claim is true before you send it.</p>
        </div>
      );
    case 'MESSAGE':
      return (
        <div className="space-y-1.5">
          <Textarea rows={5} value={edits.message} onChange={(e) => setEdits({ ...edits, message: e.target.value })} aria-label="Message draft" />
          <p className="text-xs text-muted-foreground">For the {o['recipient'] === 'RECRUITER' ? 'recruiter' : 'hiring manager'}. {edits.message.length} characters.</p>
        </div>
      );
    case 'FOLLOW_UP':
      return (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Input type="date" value={edits.followUpOn} onChange={(e) => setEdits({ ...edits, followUpOn: e.target.value })} className="w-auto" aria-label="Follow-up date" />
          <span className="text-muted-foreground">{String(o['reason'])}</span>
        </div>
      );
  }
}

export function AgentRunView({ run, onChange, onSaved }: { run: AgentRunDto; onChange: (r: AgentRunDto) => void; onSaved?: () => void }) {
  const [edits, setEdits] = useState<Edits>({ coverLetter: '', message: '', followUpOn: '' });
  const [saving, setSaving] = useState(false);
  const filled = useRef<Partial<Record<AgentStepName, string>>>({});
  const finished = run.status === 'DONE' || run.status === 'FAILED';

  // Fill the editable fields as results arrive (and again after a step is re-run), without wiping user edits.
  useEffect(() => {
    const next = { ...edits };
    let changed = false;
    for (const s of run.steps) {
      if (s.status !== 'DONE' || !s.output || filled.current[s.name] === s.finishedAt) continue;
      const o = s.output as Record<string, string>;
      if (s.name === 'COVER_LETTER') next.coverLetter = o['letter'] ?? '';
      if (s.name === 'MESSAGE') next.message = o['message'] ?? '';
      if (s.name === 'FOLLOW_UP') next.followUpOn = o['date'] ?? '';
      filled.current[s.name] = s.finishedAt ?? '';
      changed = true;
    }
    if (changed) setEdits(next);
  }, [run]);

  async function rerun(index: number) {
    try {
      onChange(await api<AgentRunDto>(`/agent-runs/${run.id}/steps/${index}/rerun`, { method: 'POST' }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function save() {
    setSaving(true);
    try {
      const done = (n: AgentStepName) => run.steps.find((s) => s.name === n)?.status === 'DONE';
      onChange(
        await api<AgentRunDto>(`/agent-runs/${run.id}/save`, {
          method: 'POST',
          body: { coverLetter: done('COVER_LETTER') ? edits.coverLetter : null, message: done('MESSAGE') ? edits.message : null, followUpOn: done('FOLLOW_UP') ? edits.followUpOn : null },
        }),
      );
      toast.success('Saved to the application. Nothing has been sent.');
      onSaved?.();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const doneCount = run.steps.filter((s) => s.status === 'DONE').length;
  const needsKey = run.steps.some((s) => s.status === 'SKIPPED' && AI_STEPS.includes(s.name));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas-deep" role="progressbar" aria-valuemin={0} aria-valuemax={7} aria-valuenow={doneCount} aria-label="Agent progress">
          <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${(run.steps.filter((s) => s.status !== 'PENDING' && s.status !== 'RUNNING').length / 7) * 100}%` }} />
        </div>
        <span className="text-xs font-semibold text-ink-soft tabular-nums" aria-live="polite">
          {finished ? `Finished: ${doneCount} of 7 done` : run.status === 'QUEUED' ? 'Starting…' : 'Working…'}
        </span>
      </div>
      {run.replay ? <p className="rounded-md bg-spark-tint px-3 py-2 text-sm text-ink">A recorded run, replayed with its original timing. Add your own key in the demo to try it live.</p> : null}
      {needsKey && finished ? (
        <p className="flex items-center gap-2 rounded-md bg-info-tint px-3 py-2 text-sm text-info">
          <KeyRound className="size-4 shrink-0" aria-hidden />
          The writing steps need an AI key.{' '}
          <Link href="/app/settings/ai" className="font-semibold underline">
            Add one in Settings
          </Link>{' '}
          (Gemini has a free tier).
        </p>
      ) : null}
      <ol className="relative space-y-3 before:absolute before:top-4 before:bottom-4 before:left-[0.9375rem] before:w-px before:bg-line">
        {run.steps.map((s) => (
          <li key={s.index} className="relative flex gap-3">
            <span className={cn('relative z-10 grid size-8 shrink-0 place-items-center rounded-full transition-all duration-300', RING[s.status])}>
              <StatusIcon s={s.status} ai={AI_STEPS.includes(s.name)} />
            </span>
            <section className={cn('min-w-0 flex-1 rounded-lg border bg-paper transition-colors', s.status === 'RUNNING' ? 'border-brand/40' : 'border-border', s.status === 'PENDING' && 'opacity-60')}>
              <header className="flex items-center gap-2 px-4 py-2.5">
                <h3 className="font-semibold">{AGENT_STEP_LABELS[s.name]}</h3>
                {AI_STEPS.includes(s.name) ? <span className="rounded-full bg-spark-tint px-1.5 py-px text-[0.65rem] font-bold text-spark">AI</span> : <span className="rounded-full bg-canvas-deep px-1.5 py-px text-[0.65rem] font-bold text-ink-soft">No AI</span>}
                {finished && !run.replay && (s.status === 'DONE' || s.status === 'FAILED' || s.status === 'SKIPPED') ? (
                  <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={() => void rerun(s.index)}>
                    <RotateCcw className="size-3.5" aria-hidden /> Run again
                  </Button>
                ) : null}
              </header>
              {s.status === 'RUNNING' ? (
                <div className="space-y-2 px-4 pb-4" aria-hidden>
                  <div className="h-3 w-3/4 animate-pulse rounded bg-canvas-deep" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-canvas-deep" />
                </div>
              ) : null}
              {s.status === 'DONE' ? (
                <div className="border-t border-border px-4 py-3">
                  <Result step={s} edits={edits} setEdits={setEdits} />
                </div>
              ) : null}
              {(s.status === 'FAILED' || s.status === 'SKIPPED') && s.error ? <p className={cn('border-t border-border px-4 py-3 text-sm', s.status === 'FAILED' ? 'text-bad' : 'text-ink-soft')}>{s.error}</p> : null}
            </section>
          </li>
        ))}
      </ol>
      {finished ? (
        <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-lg border border-border bg-paper/95 p-3 shadow-[0_10px_30px_-12px_rgb(22_26_43/0.3)] backdrop-blur sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-ink-soft">{run.savedAt ? 'Saved to the application. You can edit and save again.' : 'Review and edit above, then save. Nothing is sent anywhere.'}</p>
          <Button onClick={() => void save()} disabled={saving || run.replay}>
            <Save className="size-4" aria-hidden /> {saving ? 'Saving…' : 'Save to application'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
