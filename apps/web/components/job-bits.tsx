'use client';

import { BadgeCheck, CircleHelp, Flame, SearchX } from 'lucide-react';
import { STAGE_LABELS, daysBetween, dateKey, formatSalaryRange, type SponsorBadge as Badge, type Stage } from '@jobsmith/shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Literal class names per stage (Tailwind needs to see them). */
export const STAGE_STYLE: Record<Stage, { text: string; tint: string; rule: string; edge: string; top: string }> = {
  SAVED: { text: 'text-stage-saved', tint: 'bg-stage-saved-tint', rule: 'bg-stage-saved', edge: 'border-l-stage-saved', top: 'border-t-stage-saved' },
  APPLIED: { text: 'text-stage-applied', tint: 'bg-stage-applied-tint', rule: 'bg-stage-applied', edge: 'border-l-stage-applied', top: 'border-t-stage-applied' },
  SCREENING: { text: 'text-stage-screening', tint: 'bg-stage-screening-tint', rule: 'bg-stage-screening', edge: 'border-l-stage-screening', top: 'border-t-stage-screening' },
  INTERVIEW: { text: 'text-stage-interview', tint: 'bg-stage-interview-tint', rule: 'bg-stage-interview', edge: 'border-l-stage-interview', top: 'border-t-stage-interview' },
  OFFER: { text: 'text-stage-offer', tint: 'bg-stage-offer-tint', rule: 'bg-stage-offer', edge: 'border-l-stage-offer', top: 'border-t-stage-offer' },
  REJECTED: { text: 'text-stage-rejected', tint: 'bg-stage-rejected-tint', rule: 'bg-stage-rejected', edge: 'border-l-stage-rejected', top: 'border-t-stage-rejected' },
  WITHDRAWN: { text: 'text-stage-withdrawn', tint: 'bg-stage-withdrawn-tint', rule: 'bg-stage-withdrawn', edge: 'border-l-stage-withdrawn', top: 'border-t-stage-withdrawn' },
};

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  const s = STAGE_STYLE[stage];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', s.tint, s.text, className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', s.rule)} />
      {STAGE_LABELS[stage]}
    </span>
  );
}

const SPONSOR = {
  LICENSED: { icon: BadgeCheck, label: 'Licensed sponsor', cls: 'bg-ok-tint text-ok' },
  POSSIBLE: { icon: CircleHelp, label: 'Possible sponsor', cls: 'bg-warn-tint text-warn' },
  NOT_FOUND: { icon: SearchX, label: 'Not on register', cls: 'bg-none-tint text-none' },
  UNKNOWN: { icon: CircleHelp, label: 'Register not loaded', cls: 'bg-none-tint text-none' },
} as const;

/** "Licensed to sponsor", never "will sponsor you" (PRD section 5). */
export function SponsorBadge({ sponsor, compact }: { sponsor: Badge; compact?: boolean }) {
  if (compact && sponsor.status !== 'LICENSED') return null;
  const s = SPONSOR[sponsor.status];
  const detail =
    sponsor.status === 'LICENSED'
      ? `${sponsor.sponsorName} is on the Home Office register of licensed sponsors${sponsor.routes.length ? ` (${sponsor.routes.join(', ')})` : ''}. This means they are licensed to sponsor, not that this job will.`
      : sponsor.status === 'NOT_FOUND'
        ? 'No exact match on the Home Office register of licensed sponsors. The company may use a different legal name.'
        : sponsor.status === 'POSSIBLE'
          ? 'A similar name is on the register. Check the company page to confirm.'
          : 'The sponsor register hasn’t been downloaded yet. It updates daily.';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', s.cls)}>
          <s.icon className="size-3.5" aria-hidden />
          {compact ? 'Sponsor' : s.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{detail}</TooltipContent>
    </Tooltip>
  );
}

/** Days in the current stage. Turns ember after two weeks without movement. */
export function DaysInStage({ since, tz, stage }: { since: string; tz: string; stage: Stage }) {
  const days = Math.max(0, daysBetween(dateKey(since, tz), dateKey(new Date(), tz)));
  const stale = days >= 14 && !['OFFER', 'REJECTED', 'WITHDRAWN'].includes(stage);
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs tabular-nums', stale ? 'font-semibold text-spark' : 'text-muted-foreground')} title={`${days} days in this stage`}>
      {stale ? <Flame className="size-3.5" aria-hidden /> : null}
      {days === 0 ? 'Today' : `${days}d`}
    </span>
  );
}

export function Salary({ min, max, currency }: { min: number | null; max: number | null; currency: string }) {
  const text = formatSalaryRange(min, max, currency);
  return text ? <span className="tabular-nums">{text}</span> : null;
}
