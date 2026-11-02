'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SetupStatus } from '@jobsmith/shared';
import { AccountForm } from '@/components/account-form';
import { FormError } from '@/components/form-error';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

export default function SignupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  useEffect(() => {
    api<SetupStatus>('/setup').then(setStatus).catch(() => setStatus({ setupNeeded: false, signupEnabled: false, demoMode: false }));
  }, []);

  if (!status) return <Skeleton className="h-80 w-full" />;
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-title font-bold">Create your account</h1>
        <p className="text-muted-foreground">Everything you add is private to you.</p>
      </div>
      {status.signupEnabled ? (
        <AccountForm path="/auth/signup" submitLabel="Create account" />
      ) : (
        <FormError message="Sign-up is closed on this Jobsmith. Ask the person who runs it, or run your own copy." />
      )}
      <p className="text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
