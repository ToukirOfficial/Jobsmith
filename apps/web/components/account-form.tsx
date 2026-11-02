'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { setupSchema, type LoginResult } from '@jobsmith/shared';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useForm } from '@/lib/form';

/** First-run setup and open sign-up share this form. */
export function AccountForm({ path, submitLabel }: { path: '/setup' | '/auth/signup'; submitLabel: string }) {
  const router = useRouter();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const form = useForm(setupSchema);
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await form.submit<LoginResult>(values, path);
    if (!res) return;
    // With email set up, sign-up continues on the login page with a code.
    if (res.status === 'code') router.replace(`/login?created=1&email=${encodeURIComponent(values.email)}`);
    else router.replace('/app?welcome=1');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormError message={form.formError} />
      <Field label="Your name" error={form.errors['name']}>
        {(p) => <Input {...p} autoComplete="name" value={values.name} onChange={set('name')} autoFocus />}
      </Field>
      <Field label="Email" error={form.errors['email']}>
        {(p) => <Input {...p} type="email" autoComplete="email" value={values.email} onChange={set('email')} />}
      </Field>
      <Field label="Password" hint="At least 10 characters. A few unrelated words work well." error={form.errors['password']}>
        {(p) => <PasswordInput {...p} autoComplete="new-password" value={values.password} onChange={set('password')} />}
      </Field>
      <Button type="submit" className="w-full" size="lg" disabled={form.pending}>
        {form.pending ? 'Creating your account…' : submitLabel}
      </Button>
    </form>
  );
}
