'use client';

import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { formatDateTime } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

interface Mail {
  id: string;
  to: string;
  subject: string;
  text: string;
  createdAt: string;
}

/** Demo only: emails Jobsmith would have sent (reminders, codes) are kept here instead. */
export default function DemoMailPage() {
  const { tz } = useSession();
  const { data, error, loading, reload } = useApi<Mail[]>('/demo/mail');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Demo mailbox" description="In the demo, emails are kept here instead of being sent. On your own copy they go to your inbox." />
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {loading && !data ? <ListSkeleton /> : null}
      {data && !data.length ? (
        <EmptyState icon={Inbox} title="No emails yet">
          Reminder emails appear here when they’re due. Check back in a few minutes.
        </EmptyState>
      ) : null}
      <ul className="divide-y divide-border rounded-lg border border-border bg-paper">
        {(data ?? []).map((m) => (
          <li key={m.id}>
            <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>
              <span className="min-w-0 flex-1 truncate font-medium">{m.subject}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(m.createdAt, tz)}</span>
            </button>
            <pre className={cn('overflow-x-auto px-4 pb-4 font-sans text-sm whitespace-pre-wrap text-ink-soft', open !== m.id && 'hidden')}>{m.text}</pre>
          </li>
        ))}
      </ul>
    </>
  );
}
