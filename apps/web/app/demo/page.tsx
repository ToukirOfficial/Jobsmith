'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import type { SetupStatus } from '@jobsmith/shared';
import { Logo } from '@/components/brand';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';

export default function DemoPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<SetupStatus>('/setup').then(setStatus, () => setStatus({ setupNeeded: false, signupEnabled: false, demoMode: false }));
  }, []);

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-5 py-10">
      <Link href="/" aria-label="Jobsmith home" className="w-fit">
        <Logo />
      </Link>
      <h1 className="text-title font-bold">Try Jobsmith with a made-up job search</h1>
      <p className="text-ink-soft">
        You get your own private copy of Alex Morgan’s job search: 25 applications in every stage, three CV versions, interviews, reminders and eight weeks of stats. Everything is fictional. It’s deleted after 24 hours.
      </p>
      <ul className="space-y-2 text-sm text-ink-soft">
        <li className="flex gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-spark" aria-hidden /> Open Atlas Freight, Sablewood Studio or Cobalt & Pine and press “Prepare application” to watch a recorded agent run.
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden /> Want it live? Add your own Gemini key in Settings → AI. It’s encrypted, used only by you, and deleted with your demo after 24 hours.
        </li>
      </ul>
      <FormError message={error} />
      {status && !status.demoMode ? (
        <p className="rounded-md bg-canvas-deep p-3 text-sm">This copy of Jobsmith isn’t running the demo. <Link href="/login" className="font-semibold text-brand">Log in</Link> instead.</p>
      ) : (
        <Button
          size="lg"
          className="w-fit"
          disabled={pending || !status}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              await api('/demo/start', { method: 'POST' });
              router.replace('/app');
            } catch (e) {
              setError(errorMessage(e));
              setPending(false);
            }
          }}
        >
          {pending ? 'Setting up your demo…' : 'Start the demo'}
        </Button>
      )}
    </main>
  );
}
