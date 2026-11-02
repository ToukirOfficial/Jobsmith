'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime, type AgentRunDto } from '@jobsmith/shared';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

/** The one button: "Prepare application". Shows earlier runs underneath. */
export function AgentPanel({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const { tz } = useSession();
  const runs = useApi<AgentRunDto[]>(`/applications/${applicationId}/agent-runs`);
  const [starting, setStarting] = useState(false);
  const active = runs.data?.find((r) => r.status === 'QUEUED' || r.status === 'RUNNING');

  return (
    <section className="overflow-hidden rounded-lg border border-brand/25 bg-paper">
      <div className="relative bg-[radial-gradient(120%_120%_at_100%_0%,var(--brand-tint),transparent_60%)] p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand text-white">
            <Sparkles className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold">Application agent</h2>
            <p className="text-sm text-ink-soft">Reads the job, checks sponsorship and salary, picks your best CV and drafts the letter and a short message. You review everything.</p>
          </div>
        </div>
        <Button
          className="mt-3 w-full"
          disabled={starting}
          onClick={async () => {
            if (active) return router.push(`/app/applications/${applicationId}/agent/${active.id}`);
            setStarting(true);
            try {
              const run = await api<AgentRunDto>(`/applications/${applicationId}/agent-runs`, { method: 'POST' });
              router.push(`/app/applications/${applicationId}/agent/${run.id}`);
            } catch (e) {
              toast.error(errorMessage(e));
              setStarting(false);
            }
          }}
        >
          <Sparkles className="size-4" aria-hidden /> {active ? 'Watch the agent' : starting ? 'Starting…' : 'Prepare application'}
        </Button>
      </div>
      {runs.data?.length ? (
        <ul className="divide-y divide-border border-t border-border text-sm">
          {runs.data.slice(0, 4).map((r) => (
            <li key={r.id}>
              <Link href={`/app/applications/${applicationId}/agent/${r.id}`} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-canvas">
                <span>{formatDateTime(r.createdAt, tz)}</span>
                <span className="text-xs text-muted-foreground">{r.savedAt ? 'Saved' : r.status === 'DONE' ? `${r.steps.filter((s) => s.status === 'DONE').length}/7 done` : r.status.toLowerCase()}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
