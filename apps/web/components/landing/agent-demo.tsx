'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The hero: one recorded agent run (fictional), stepping through on a loop. */
const STEPS: { label: string; ai: boolean; ms: number; result: React.ReactNode }[] = [
  {
    label: 'Read the job',
    ai: true,
    ms: 1500,
    result: (
      <span className="flex flex-wrap gap-1">
        {['TypeScript', 'React', 'Node.js', 'PostgreSQL'].map((s) => (
          <span key={s} className="rounded-full bg-canvas-deep px-2 py-px text-[0.7rem] font-semibold">
            {s}
          </span>
        ))}
      </span>
    ),
  },
  {
    label: 'Sponsor check',
    ai: false,
    ms: 700,
    result: (
      <span className="inline-flex items-center gap-1 rounded-full bg-ok-tint px-2 py-px text-[0.7rem] font-semibold text-ok">
        <BadgeCheck className="size-3" aria-hidden /> Licensed to sponsor: Skilled Worker
      </span>
    ),
  },
  { label: 'Salary check', ai: false, ms: 600, result: <span>£48,000 meets the £41,700 general threshold (guide only)</span> },
  { label: 'Pick the best CV', ai: false, ms: 900, result: <span>General full-stack, match score 87</span> },
  {
    label: 'Draft a cover letter',
    ai: true,
    ms: 2200,
    result: <span className="italic">“At Fernleaf Studio I cut our main dashboard’s load time from 3.1 to 1.2 seconds…”</span>,
  },
  { label: 'Draft a short message', ai: true, ms: 1300, result: <span className="italic">“Hi Priya, I’ve just applied for the Full-stack Engineer role…”</span> },
  { label: 'Suggest a follow-up date', ai: false, ms: 500, result: <span>Mon 16 Nov, 7 days after you apply</span> },
];

export function AgentDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStep(STEPS.length);
      return;
    }
    const delay = step < STEPS.length ? STEPS[step]!.ms : 4200;
    const t = setTimeout(() => setStep((s) => (s >= STEPS.length ? 0 : s + 1)), delay);
    return () => clearTimeout(t);
  }, [step]);

  const done = step >= STEPS.length;
  return (
    <div className="relative rounded-xl border border-border bg-paper p-4 shadow-[0_30px_60px_-30px_rgb(22_26_43/0.35)] sm:p-5" aria-label="An example agent run" role="img">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Full-stack Engineer, Sablewood Studio</p>
          <p className="text-xs text-muted-foreground">Prepare application</p>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors', done ? 'bg-ok-tint text-ok' : 'bg-brand-tint text-brand')}>{done ? 'Ready to review' : `${Math.min(step, 7)}/7`}</span>
      </div>
      <ol className="space-y-2" aria-hidden>
        {STEPS.map((s, i) => {
          const state = i < step ? 'done' : i === step ? 'running' : 'pending';
          return (
            <li key={s.label} className={cn('flex gap-3 rounded-lg border px-3 py-2 transition-all duration-500', state === 'running' ? 'border-brand/40 bg-brand-tint/40' : 'border-border', state === 'pending' && 'opacity-45')}>
              <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-300', state === 'done' ? 'bg-ok text-white' : state === 'running' ? 'bg-brand text-white' : 'bg-canvas-deep')}>
                {state === 'done' ? <Check className="size-3" /> : state === 'running' ? <Loader2 className="size-3 animate-spin" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {s.label}
                  <span className={cn('rounded-full px-1.5 text-[0.6rem] font-bold', s.ai ? 'bg-spark-tint text-spark' : 'bg-canvas-deep text-ink-soft')}>{s.ai ? 'AI' : 'No AI'}</span>
                </span>
                <span className={cn('grid text-xs text-ink-soft transition-[grid-template-rows,opacity] duration-500', state === 'done' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                  <span className="overflow-hidden pt-1">{s.result}</span>
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className={cn('mt-4 flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2 text-xs transition-opacity duration-500', done ? 'opacity-100' : 'opacity-0')}>
        <span className="text-ink-soft">Nothing is sent. You review and edit everything.</span>
        <span className="rounded-md bg-brand px-2.5 py-1 font-semibold text-white">Save to application</span>
      </div>
    </div>
  );
}
