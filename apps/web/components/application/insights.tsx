'use client';

import { useState } from 'react';
import { Check, ExternalLink, Minus, Scale, Target } from 'lucide-react';
import { formatSalary, type InsightsDto } from '@jobsmith/shared';
import { Section } from '@/components/section';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const IMPORTANCE = { MUST: 'Must-have', NICE: 'Nice to have', MENTIONED: 'Mentioned' } as const;

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 70 ? 'var(--ok)' : score >= 45 ? 'var(--warn)' : 'var(--bad)';
  return (
    <div className="relative grid size-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${tone} ${score * 3.6}deg, var(--canvas-deep) 0deg)` }} role="img" aria-label={`Match score ${score} out of 100`}>
      <div className="grid size-12 place-items-center rounded-full bg-paper text-lg font-extrabold tabular-nums">{score}</div>
    </div>
  );
}

export function InsightsSection({ applicationId, refreshKey }: { applicationId: string; refreshKey?: string }) {
  const [version, setVersion] = useState('');
  const { data, loading } = useApi<InsightsDto>(`/applications/${applicationId}/insights${version ? `?cvVersionId=${version}` : ''}${refreshKey ? `${version ? '&' : '?'}r=${encodeURIComponent(refreshKey)}` : ''}`);
  if (loading && !data) return <Skeleton className="h-56 w-full" />;
  if (!data) return null;
  const k = data.keywords;
  return (
    <div className="grid gap-6 2xl:grid-cols-2">
      <Section title="Keyword match" description="Skills in the job, and which ones your CV version shows. No AI involved.">
        {!data.hasDescription ? (
          <p className="text-sm text-muted-foreground">Add the job description to see which skills your CV covers.</p>
        ) : !k ? (
          <p className="text-sm text-muted-foreground">Make a CV version in the CV builder to compare it with this job.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <ScoreRing score={k.score} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm">
                  <span className="font-semibold">{k.covered}</span> of {k.total} skills covered
                </p>
                <NativeSelect value={version || k.cvVersionId} onChange={(e) => setVersion(e.target.value)} aria-label="CV version to compare">
                  {data.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.score})
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            {k.keywords.length ? (
              <ul className="flex flex-wrap gap-1.5" aria-label="Skills in the job">
                {k.keywords.map((w) => (
                  <li
                    key={w.term}
                    title={`${IMPORTANCE[w.importance]}: ${w.covered ? 'on your CV' : 'missing from this CV version'}`}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      w.covered ? 'border-ok/20 bg-ok-tint text-ok' : w.importance === 'MUST' ? 'border-bad/25 bg-bad-tint text-bad' : 'border-border bg-canvas text-ink-soft',
                    )}
                  >
                    {w.covered ? <Check className="size-3" aria-hidden /> : <Minus className="size-3" aria-hidden />}
                    {w.term}
                    {w.importance === 'MUST' ? <span className="sr-only"> (must-have)</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No skills from the dictionary were found in this description.</p>
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Target className="size-3.5" aria-hidden /> Red means a must-have skill your CV doesn’t mention. Only add skills you really have.
            </p>
          </div>
        )}
      </Section>

      <Section title="Salary check (UK, guide only)" description="Compared with the Skilled Worker thresholds. Check GOV.UK before relying on it.">
        {data.salary ? (
          <div className="space-y-3 text-sm">
            <p className="flex gap-2">
              <Scale className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden />
              {data.salary.message}
            </p>
            <dl className="grid grid-cols-2 gap-2">
              {(['general', 'newEntrant'] as const).map((key) => {
                const t = data.salary![key];
                const likely = (key === 'general' && data.salary!.likely === 'GENERAL') || (key === 'newEntrant' && data.salary!.likely === 'NEW_ENTRANT');
                return (
                  <div key={key} className={cn('rounded-md border p-3', likely ? 'border-brand/40 bg-brand-tint/40' : 'border-border')}>
                    <dt className="text-xs text-muted-foreground">
                      {key === 'general' ? 'General threshold' : 'New-entrant threshold'}
                      {likely ? ' (likely yours)' : ''}
                    </dt>
                    <dd className="font-semibold tabular-nums">{formatSalary(t.thresholdPence)}</dd>
                    <dd className={cn('text-xs font-semibold', t.verdict === 'MEETS' ? 'text-ok' : t.verdict === 'BELOW' ? 'text-bad' : 'text-muted-foreground')}>
                      {t.verdict === 'MEETS' ? 'Meets the threshold (guide only)' : t.verdict === 'BELOW' ? 'Below' : 'Can’t tell'}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className="text-xs text-muted-foreground">
              New-entrant rates apply if you are under 26, switching from a Student or Graduate visa, or in some training roles. The job must also meet the going rate for its occupation, which isn’t checked here. Rules in force from {data.salary.effectiveFrom}, last checked {data.salary.checkedOn}.
            </p>
            <ul className="space-y-1 text-xs">
              {data.salary.sources.map((s) => (
                <li key={s.url + s.label}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                    {s.label} <ExternalLink className="size-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No salary rules apply to today’s date.</p>
        )}
      </Section>
    </div>
  );
}
