'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SetupStatus } from '@jobsmith/shared';
import { AccountForm } from '@/components/account-form';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

export default function SetupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<SetupStatus>('/setup')
      .then((s) => (s.setupNeeded ? setReady(true) : router.replace('/login')))
      .catch(() => setReady(true));
  }, [router]);

  if (!ready) return <Skeleton className="h-80 w-full" />;
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-brand">Welcome to your Jobsmith</p>
        <h1 className="text-title font-bold">Create your account</h1>
        <p className="text-muted-foreground">This is a fresh install. The first account created here owns it, and this page closes for good afterwards.</p>
      </div>
      <AccountForm path="/setup" submitLabel="Create account" />
    </div>
  );
}
