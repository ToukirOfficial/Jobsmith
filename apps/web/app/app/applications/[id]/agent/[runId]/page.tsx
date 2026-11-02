'use client';

import { useParams } from 'next/navigation';
import { formatDateTime } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { AgentRunView, useAgentRun } from '@/components/agent/agent-run';
import { ErrorState, ListSkeleton } from '@/components/states';
import { useSession } from '@/lib/session';

export default function AgentRunPage() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const { tz } = useSession();
  const { run, setRun, error } = useAgentRun(runId);
  if (error && !run) return <ErrorState error={new Error(error)} />;
  if (!run) return <ListSkeleton rows={7} />;
  return (
    <>
      <PageHeader
        back={{ href: `/app/applications/${id}`, label: run.application.title }}
        title="Prepare application"
        description={`${run.application.title} at ${run.application.company}. Started ${formatDateTime(run.createdAt, tz)}.`}
      />
      <div className="mx-auto max-w-3xl">
        <AgentRunView run={run} onChange={setRun} />
      </div>
    </>
  );
}
