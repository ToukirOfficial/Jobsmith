import Link from 'next/link';
import { Logo } from '@/components/brand';

const POINTS = ['Every application, CV version and follow-up in one place', 'UK sponsor and salary checks built in', 'An AI agent that prepares, while you decide'];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" aria-label="Jobsmith home" className="w-fit">
          <Logo />
        </Link>
        <main id="main" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {children}
        </main>
        <p className="text-xs text-muted-foreground">Jobsmith is free, open-source software (AGPL-3.0). Your data stays on this server.</p>
      </div>
      <aside className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-end lg:p-12">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_10%,color-mix(in_srgb,var(--brand)_70%,transparent),transparent),radial-gradient(40%_35%_at_10%_90%,color-mix(in_srgb,var(--spark)_35%,transparent),transparent)]" />
        <div className="relative max-w-md space-y-6">
          <p className="text-3xl leading-tight font-bold tracking-tight">Your job search, organised. The boring half, done for you.</p>
          <ul className="space-y-3 text-white/80">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-spark" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
