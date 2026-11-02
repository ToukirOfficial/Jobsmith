'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { loginSchema, verifyCodeSchema, type LoginResult, type SetupStatus } from '@jobsmith/shared';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { destinationAfterLogin } from '@/lib/after-login';
import { useForm } from '@/lib/form';
import { toast } from 'sonner';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const [emailValue, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<{ challenge: string; email: string } | null>(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const login = useForm(loginSchema);
  const verify = useForm(verifyCodeSchema);

  useEffect(() => {
    api<SetupStatus>('/setup')
      .then((s) => {
        if (s.setupNeeded) router.replace('/setup');
        else setStatus(s);
      })
      .catch(() => undefined);
  }, [router]);

  function finish() {
    router.replace(destinationAfterLogin(next));
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    const res = await login.submit<LoginResult>({ email: emailValue, password }, '/auth/login');
    if (!res) return;
    if (res.status === 'ok') finish();
    else setChallenge({ challenge: res.challenge, email: res.email });
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    const res = await verify.submit({ challenge: challenge!.challenge, code }, '/auth/verify-code');
    if (res) finish();
  }

  async function resend() {
    try {
      const res = await api<LoginResult>('/auth/resend-code', { method: 'POST', body: { challenge: challenge!.challenge } });
      if (res.status === 'code') setChallenge({ challenge: res.challenge, email: res.email });
      toast.success('We sent a new code.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  if (challenge) {
    return (
      <form onSubmit={onVerify} className="space-y-5" noValidate>
        <div className="space-y-1.5">
          <h1 className="text-title font-bold">Check your email</h1>
          <p className="text-muted-foreground">
            We sent a 6-digit code to <span className="font-semibold text-ink">{challenge.email}</span>. It works for 10 minutes.
          </p>
        </div>
        <FormError message={verify.formError} />
        <Field label="Login code" error={verify.errors['code']}>
          {(p) => (
            <Input
              {...p}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className="h-12 text-center text-xl tracking-[0.4em]"
            />
          )}
        </Field>
        <Button type="submit" className="w-full" size="lg" disabled={verify.pending || code.length !== 6}>
          {verify.pending ? 'Checking…' : 'Log in'}
        </Button>
        <div className="flex justify-between text-sm">
          <button type="button" className="text-brand hover:underline" onClick={() => void resend()}>
            Send a new code
          </button>
          <button type="button" className="text-muted-foreground hover:underline" onClick={() => setChallenge(null)}>
            Use a different email
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onLogin} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <h1 className="text-title font-bold">Log in to Jobsmith</h1>
        <p className="text-muted-foreground">Your private job search workspace.</p>
      </div>
      {params.get('created') ? <p className="rounded-md bg-ok-tint px-3 py-2 text-sm text-ok">Account created. Log in to confirm your email address.</p> : null}
      <FormError message={login.formError} />
      <Field label="Email" error={login.errors['email']}>
        {(p) => <Input {...p} type="email" autoComplete="email" value={emailValue} onChange={(e) => setEmail(e.target.value)} autoFocus />}
      </Field>
      <Field label="Password" error={login.errors['password']}>
        {(p) => <PasswordInput {...p} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Button type="submit" className="w-full" size="lg" disabled={login.pending}>
        {login.pending ? 'Logging in…' : 'Log in'}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/reset" className="text-brand hover:underline">
          Forgot your password?
        </Link>
        {status?.signupEnabled ? (
          <Link href="/signup" className="text-brand hover:underline">
            Create an account
          </Link>
        ) : null}
        {status?.demoMode ? (
          <Link href="/demo" className="text-brand hover:underline">
            Try the demo
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
