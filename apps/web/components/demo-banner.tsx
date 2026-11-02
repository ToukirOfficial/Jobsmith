'use client';

import { useSession } from '@/lib/session';

/** Shown on every page of the demo, so nobody mistakes the fake data for real. */
export function DemoBanner() {
  const { me } = useSession();
  if (!me.demoMode) return null;
  return (
    <div className="border-b border-spark/30 bg-spark-tint px-4 py-2 text-center text-sm text-ink">
      This is the Jobsmith demo. Everything here is made up, private to you, and deleted after 24 hours.{' '}
      <a href="/app/demo-mail" className="font-semibold text-brand underline underline-offset-2">
        See the emails it sent
      </a>
    </div>
  );
}
