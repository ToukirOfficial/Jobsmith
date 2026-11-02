'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bell, CalendarClock, Hourglass, Plus, Sparkles } from 'lucide-react';
import { INTERVIEW_TYPE_LABELS, REMINDER_KIND_LABELS, formatDateTime, type DashboardDto, type RateRow } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { Section } from '@/components/section';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const FUNNEL_TONE = ['bg-stage-saved', 'bg-stage-applied', 'bg-stage-screening', 'bg-stage-interview', 'bg-stage-offer'];

function TodayCard({ icon: Icon, title, count, children, empty }: { icon: typeof Bell; title: string; count: number; children: React.ReactNode; empty: string }) {
  return (
    <section className="flex flex-col rounded-lg border border-border bg-paper">
      <header className="flex items-center gap-2 px-4 pt-4">
        <Icon className="size-4 text-ink-soft" aria-hidden />
        <h2 className="text-sm font-semibold text-ink-soft">{title}</h2>
        <span className="ml-auto text-2xl font-extrabold tabular-nums">{count}</span>
      </header>
      <div className="flex-1 px-4 pt-2 pb-4 text-sm">{count ? children : <p className="text-muted-foreground">{empty}</p>}</div>
    </section>
  );
}

function Funnel({ funnel }: { funnel: DashboardDto['funnel'] }) {
  const max = Math.max(1, ...funnel.map((f) => f.count));
  return (
    <ol className="space-y-2.5">
      {funnel.map((f, i) => (
        <li key={f.stage} className="grid grid-cols-[6rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
          <span className="font-medium">{f.label}</span>
          <span className="h-7 overflow-hidden rounded-md bg-canvas-deep">
            <span className={cn('flex h-full items-center rounded-md px-2 text-xs font-bold text-white tabular-nums', FUNNEL_TONE[i])} style={{ width: `${Math.max(f.count ? 8 : 0, (f.count / max) * 100)}%` }}>
              {f.count || ''}
            </span>
          </span>
          <span className="text-right text-xs text-muted-foreground tabular-nums">{f.rate == null ? '' : `${f.rate}%`}</span>
        </li>
      ))}
    </ol>
  );
}

function Rates({ title, rows, hint }: { title: string; rows: RateRow[]; hint: string }) {
  return (
    <Section title={title} description={hint}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No applications yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key} className="text-sm">
              <div className="mb-1 flex justify-between gap-2">
                <span className="truncate font-medium">{r.label}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {r.replied}/{r.applied} replied
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas-deep">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${r.rate}%` }} />
                </span>
                <span className="w-9 text-right text-xs font-semibold tabular-nums">{r.rate}%</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Goal({ goal }: { goal: DashboardDto['goal'] }) {
  const pct = goal.target ? Math.min(100, Math.round((goal.thisWeek / goal.target) * 100)) : 0;
  const done = goal.target > 0 && goal.thisWeek >= goal.target;
  return (
    <Section title="This week’s goal">
      <div className="flex items-center gap-4">
        <div className="relative grid size-20 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${done ? 'var(--ok)' : 'var(--brand)'} ${pct * 3.6}deg, var(--canvas-deep) 0deg)` }} role="img" aria-label={`${goal.thisWeek} of ${goal.target} applications this week`}>
          <div className="grid size-15 place-items-center rounded-full bg-paper">
            <span className="text-xl font-extrabold tabular-nums">
              {goal.thisWeek}
              <span className="text-sm font-semibold text-muted-foreground">/{goal.target}</span>
            </span>
          </div>
        </div>
        <p className="text-sm text-ink-soft">
          {goal.target === 0
            ? 'No weekly target set. Add one in Settings.'
            : done
              ? 'Target reached this week. Quality over quantity from here.'
              : `${goal.target - goal.thisWeek} more application${goal.target - goal.thisWeek === 1 ? '' : 's'} to reach your weekly target.`}
        </p>
      </div>
    </Section>
  );
}

function Dashboard() {
  const { me, tz } = useSession();
  const params = useSearchParams();
  const { data, error, loading, reload } = useApi<DashboardDto>('/dashboard');
  const first = me.name.split(' ')[0];

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (!data) return null;
  const nothingYet = data.funnel[0]!.count === 0;

  return (
    <>
      <PageHeader
        title={params.get('welcome') ? `Welcome, ${first}` : `Hello, ${first}`}
        description={`${data.totals.active} active ${data.totals.active === 1 ? 'application' : 'applications'}, ${data.totals.applied} sent, ${data.totals.offers} ${data.totals.offers === 1 ? 'offer' : 'offers'}.`}
        actions={
          <Button asChild>
            <Link href="/app/applications/new">
              <Plus className="size-4" aria-hidden /> Save a job
            </Link>
          </Button>
        }
      />

      {nothingYet ? (
        <EmptyState
          icon={Sparkles}
          title="Start your job search here"
          action={
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/app/applications/new">Save your first job</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/app/cv">Build your CV</Link>
              </Button>
            </div>
          }
          className="mb-6"
        >
          Fill in your profile once, make a CV version or two, then save jobs as you find them. Your stats appear here as you apply.
        </EmptyState>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <TodayCard icon={Bell} title="Reminders due" count={data.today.remindersDue.length} empty="Nothing due. Nice.">
          <ul className="space-y-1.5">
            {data.today.remindersDue.slice(0, 4).map((r) => (
              <li key={r.id}>
                <Link href={r.application ? `/app/applications/${r.application.id}` : '/app/reminders'} className="block truncate hover:text-brand">
                  <span className="font-semibold">{REMINDER_KIND_LABELS[r.kind]}:</span> {r.application ? `${r.application.title} at ${r.application.company}` : r.title}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/app/reminders" className="mt-2 inline-block text-xs font-semibold text-brand hover:underline">
            All reminders
          </Link>
        </TodayCard>
        <TodayCard icon={CalendarClock} title="Interviews this week" count={data.today.interviewsThisWeek.length} empty="No interviews in the next 7 days.">
          <ul className="space-y-1.5">
            {data.today.interviewsThisWeek.slice(0, 4).map((i) => (
              <li key={i.id}>
                <Link href={`/app/applications/${i.applicationId}`} className="block hover:text-brand">
                  <span className="block truncate font-semibold">
                    {INTERVIEW_TYPE_LABELS[i.type]}, {i.application.company}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(i.startsAt ?? i.dueAt, tz)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </TodayCard>
        <TodayCard icon={Hourglass} title="Waiting for a reply" count={data.today.waitingCount} empty="Nobody owes you a reply right now.">
          <ul className="space-y-1.5">
            {data.today.waiting.slice(0, 4).map((w) => (
              <li key={w.id} className="flex justify-between gap-2">
                <Link href={`/app/applications/${w.id}`} className="truncate hover:text-brand">
                  {w.company}
                </Link>
                <span className={cn('shrink-0 text-xs tabular-nums', w.days >= 14 ? 'font-semibold text-spark' : 'text-muted-foreground')}>{w.days}d</span>
              </li>
            ))}
          </ul>
        </TodayCard>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Section title="Funnel" description="Each percentage is the share that made it from the stage before.">
          <Funnel funnel={data.funnel} />
          <p className="mt-4 text-sm text-ink-soft">
            Average time to first reply: <span className="font-semibold text-ink">{data.avgDaysToReply == null ? 'no replies yet' : `${data.avgDaysToReply} days`}</span>
          </p>
        </Section>
        <div className="grid gap-6">
          <Goal goal={data.goal} />
          <Section title="Applications per week" description="The last eight weeks. The dashed line is your weekly target.">
            <div className="h-44" role="img" aria-label={`Applications per week: ${data.weekly.map((w) => w.applied).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weekly.map((w) => ({ ...w, label: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${w.weekStart}T00:00:00Z`)) }))} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} interval={1} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--ink-soft)' }} />
                  <Tooltip cursor={{ fill: 'var(--canvas-deep)' }} contentStyle={{ borderRadius: 8, borderColor: 'var(--line)', fontSize: 12 }} formatter={(v) => [v, 'Applications']} labelFormatter={(l) => `Week of ${l}`} />
                  {data.goal.target ? <ReferenceLine y={data.goal.target} stroke="var(--spark)" strokeDasharray="4 4" /> : null}
                  <Bar dataKey="applied" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Rates title="Replies by channel" rows={data.byChannel} hint="Where your replies come from." />
        <Rates title="Replies by CV version" rows={data.byCvVersion} hint="Which CV gets answered." />
        <Rates title="Replies by sponsor status" rows={data.bySponsor} hint="Licensed sponsors compared with the rest." />
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
