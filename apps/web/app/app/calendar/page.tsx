'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { addDays, dateKey, formatTime, type CalendarEvent } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { Confirm } from '@/components/confirm';
import { Section } from '@/components/section';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const KIND_STYLE: Record<CalendarEvent['kind'], string> = {
  INTERVIEW: 'bg-stage-interview-tint text-stage-interview',
  TAKE_HOME: 'bg-warn-tint text-warn',
  CLOSING: 'bg-spark-tint text-spark',
  FOLLOW_UP: 'bg-brand-tint text-brand',
};
const KIND_LABEL: Record<CalendarEvent['kind'], string> = { INTERVIEW: 'Interview', TAKE_HOME: 'Take-home due', CLOSING: 'Closing date', FOLLOW_UP: 'Follow up' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthGrid(month: string) {
  const first = `${month}-01`;
  const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -dow);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function Feed() {
  const { data, reload } = useApi<{ url: string }>('/me/calendar-feed');
  return (
    <Section title="Add to Google or Apple Calendar" description="Subscribe to this private link. Anyone with it can see your interview and deadline titles, so keep it to yourself.">
      <div className="flex gap-2">
        <Input readOnly value={data?.url ?? ''} aria-label="Calendar feed link" onFocus={(e) => e.target.select()} className="font-mono text-xs" />
        <Button
          variant="outline"
          onClick={async () => {
            if (data) await navigator.clipboard.writeText(data.url);
            toast.success('Link copied');
          }}
        >
          <Copy className="size-4" aria-hidden /> Copy
        </Button>
        <Confirm title="Make a new link?" description="The old link stops working. Calendars subscribed to it will need the new one." confirmLabel="Make new link" onConfirm={async () => {
          await api('/me/calendar-feed/rotate', { method: 'POST' });
          await reload();
          toast.success('New link made');
        }}>
          <Button variant="ghost" size="icon" aria-label="Make a new link">
            <RefreshCw className="size-4" />
          </Button>
        </Confirm>
      </div>
    </Section>
  );
}

export default function CalendarPage() {
  const { tz } = useSession();
  const today = dateKey(new Date(), tz);
  const [month, setMonth] = useState(today.slice(0, 7));
  const days = useMemo(() => monthGrid(month), [month]);
  const { data, error, loading, reload } = useApi<CalendarEvent[]>(`/calendar?from=${days[0]}&to=${addDays(days[41]!, 1)}`);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of data ?? []) {
      const k = e.allDay ? e.start : dateKey(e.start, tz);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [data, tz]);
  const shift = (n: number) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const title = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  const agenda = days.filter((d) => d.startsWith(month) && byDay.has(d));

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Interviews, take-home deadlines, closing dates and follow-ups."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => shift(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" onClick={() => setMonth(today.slice(0, 7))}>
              Today
            </Button>
            <Button variant="outline" size="icon" aria-label="Next month" onClick={() => shift(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {(Object.keys(KIND_LABEL) as CalendarEvent['kind'][]).map((k) => (
          <span key={k} className={cn('rounded-full px-2 py-0.5 font-semibold', KIND_STYLE[k])}>
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>
      {loading && !data ? <Skeleton className="h-[32rem] w-full" /> : null}

      <div className={cn('hidden overflow-hidden rounded-lg border border-border bg-paper md:block', loading && 'opacity-70')}>
        <div className="grid grid-cols-7 border-b border-border bg-canvas text-xs font-semibold text-ink-soft">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const events = byDay.get(d) ?? [];
            const inMonth = d.startsWith(month);
            return (
              <div key={d} className={cn('min-h-28 border-border p-1.5', i % 7 !== 6 && 'border-r', i < 35 && 'border-b', !inMonth && 'bg-canvas/60')}>
                <p className={cn('mb-1 text-xs tabular-nums', d === today ? 'inline-grid size-6 place-items-center rounded-full bg-brand font-bold text-white' : inMonth ? 'text-ink-soft' : 'text-line-strong')}>{Number(d.slice(8))}</p>
                <ul className="space-y-1">
                  {events.slice(0, 3).map((e) => (
                    <li key={e.id}>
                      <Link href={`/app/applications/${e.applicationId}`} title={e.title} className={cn('block truncate rounded px-1.5 py-0.5 text-[0.7rem] font-semibold', KIND_STYLE[e.kind])}>
                        {e.allDay ? '' : `${formatTime(e.start, tz)} `}
                        {e.title.replace(/^[^:]+: /, '')}
                      </Link>
                    </li>
                  ))}
                  {events.length > 3 ? <li className="px-1 text-[0.7rem] text-muted-foreground">+{events.length - 3} more</li> : null}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {data && !agenda.length ? <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-muted-foreground">Nothing this month.</p> : null}
        {agenda.map((d) => (
          <section key={d}>
            <h3 className="mb-1.5 text-sm font-bold">{new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))}</h3>
            <ul className="space-y-1.5">
              {byDay.get(d)!.map((e) => (
                <li key={e.id}>
                  <Link href={`/app/applications/${e.applicationId}`} className={cn('block rounded-md px-3 py-2 text-sm font-medium', KIND_STYLE[e.kind])}>
                    {e.allDay ? 'All day' : formatTime(e.start, tz)}: {e.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-8 max-w-3xl">
        <Feed />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarPlus className="size-3.5" aria-hidden /> In Google Calendar: Other calendars, then From URL. In Apple Calendar: File, then New Calendar Subscription.
      </p>
    </>
  );
}
