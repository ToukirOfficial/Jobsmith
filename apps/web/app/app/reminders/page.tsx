'use client';

import Link from 'next/link';
import { Bell, BellOff, CalendarClock, Check, ClipboardList, Clock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { REMINDER_KIND_LABELS, formatDateTime, type ReminderDto, type ReminderKind } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { Section } from '@/components/section';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

const ICON: Record<ReminderKind, typeof Bell> = { FOLLOW_UP: Send, INTERVIEW_TOMORROW: CalendarClock, CLOSING_SOON: Clock, TAKE_HOME_DUE: ClipboardList };

function List({ items, onDone, overdue }: { items: ReminderDto[]; onDone: (id: string) => void; overdue?: boolean }) {
  const { tz } = useSession();
  return (
    <ul className="divide-y divide-border">
      {items.map((r) => {
        const Icon = ICON[r.kind];
        return (
          <li key={r.id} className="flex items-center gap-3 px-5 py-3">
            <span className={overdue ? 'grid size-9 shrink-0 place-items-center rounded-full bg-spark-tint text-spark' : 'grid size-9 shrink-0 place-items-center rounded-full bg-canvas-deep text-ink-soft'}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink-soft">{REMINDER_KIND_LABELS[r.kind]}</p>
              {r.application ? (
                <Link href={`/app/applications/${r.application.id}`} className="block truncate font-medium hover:text-brand">
                  {r.application.title} at {r.application.company}
                </Link>
              ) : (
                <p className="truncate font-medium">{r.title}</p>
              )}
              <p className="text-xs text-muted-foreground">{formatDateTime(r.dueAt, tz)}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onDone(r.id)}>
              <Check className="size-4" aria-hidden /> Done
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export default function RemindersPage() {
  const { me } = useSession();
  const { data, error, loading, reload, setData } = useApi<ReminderDto[]>('/reminders?scope=all');
  const now = Date.now();
  const due = (data ?? []).filter((r) => Date.parse(r.dueAt) <= now);
  const upcoming = (data ?? []).filter((r) => Date.parse(r.dueAt) > now);
  async function done(id: string) {
    try {
      await api(`/reminders/${id}`, { method: 'PATCH', body: { dismissed: true } });
      setData((data ?? []).filter((r) => r.id !== id));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  return (
    <>
      <PageHeader title="Reminders" description={me.mailEnabled && me.settings.emailReminders ? 'Shown here and emailed to you when they’re due.' : 'Shown here when they’re due. Email reminders are off.'} />
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {loading && !data ? <ListSkeleton /> : null}
      {data && !data.length ? (
        <EmptyState icon={BellOff} title="Nothing to remind you about">
          Reminders appear when you apply (follow up after {me.settings.followUpDays} days), add an interview or take-home, or save a job with a closing date.
        </EmptyState>
      ) : null}
      <div className="space-y-6">
        {due.length ? (
          <Section title={`Due now (${due.length})`} flush>
            <List items={due} onDone={(id) => void done(id)} overdue />
          </Section>
        ) : null}
        {upcoming.length ? (
          <Section title="Coming up" flush>
            <List items={upcoming} onDone={(id) => void done(id)} />
          </Section>
        ) : null}
      </div>
    </>
  );
}
