'use client';

import { AppShell } from '@/components/app-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionProvider } from '@/lib/session';

function ShellSkeleton() {
  return (
    <div className="min-h-dvh lg:pl-64" aria-busy="true" aria-label="Loading">
      <div className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-paper lg:block" />
      <div className="h-16 border-b border-border" />
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider fallback={<ShellSkeleton />}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
