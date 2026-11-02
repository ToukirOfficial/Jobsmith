'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { resetConfirmSchema, resetRequestSchema } from '@jobsmith/shared';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useForm } from '@/lib/form';

function RequestForm() {
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);
  const form = useForm(resetRequestSchema);
  if (sent) {
    return (
      <div className="space-y-3">
        <h1 className="text-title font-bold">Check your email</h1>
        <p className="text-muted-foreground">If {value} has an Jobsmith account, we’ve sent a link to choose a new password. It works for 30 minutes.</p>
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (await form.submit({ email: value }, '/auth/reset/request')) setSent(true);
      }}
    >
      <div className="space-y-1.5">
        <h1 className="text-title font-bold">Reset your password</h1>
        <p className="text-muted-foreground">Enter your email and we’ll send you a link.</p>
      </div>
      <FormError message={form.formError} />
      <Field label="Email" error={form.errors['email']}>
        {(p) => <Input {...p} type="email" autoComplete="email" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />}
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={form.pending}>
        {form.pending ? 'Sending…' : 'Send reset link'}
      </Button>
      <Link href="/login" className="block text-sm text-brand hover:underline">
        Back to log in
      </Link>
    </form>
  );
}

function ConfirmForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const form = useForm(resetConfirmSchema);
  if (done) {
    return (
      <div className="space-y-3">
        <h1 className="text-title font-bold">Password changed</h1>
        <p className="text-muted-foreground">You’ve been logged out everywhere. Log in with your new password.</p>
        <Button asChild>
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (await form.submit({ token, password }, '/auth/reset/confirm')) setDone(true);
      }}
    >
      <h1 className="text-title font-bold">Choose a new password</h1>
      <FormError message={form.formError} />
      <Field label="New password" hint="At least 10 characters." error={form.errors['password']}>
        {(p) => <PasswordInput {...p} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />}
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={form.pending}>
        {form.pending ? 'Saving…' : 'Save new password'}
      </Button>
    </form>
  );
}

function Reset() {
  const token = useSearchParams().get('token');
  return token ? <ConfirmForm token={token} /> : <RequestForm />;
}

export default function ResetPage() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}
