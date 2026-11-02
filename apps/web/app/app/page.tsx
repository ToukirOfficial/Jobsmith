'use client';

import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Section } from '@/components/section';
import { useSession } from '@/lib/session';

const STEPS = [
  { href: '/app/settings', label: 'Tell Jobsmith what you’re looking for', done: (s: { targetRoles: string[] }) => s.targetRoles.length > 0 },
  { href: '/app/cv', label: 'Fill in your profile and make two CV versions', done: () => false },
  { href: '/app/applications/new', label: 'Save your first job', done: () => false },
];

/** Placeholder until the dashboard (Phase 6): a short getting-started list. */
export default function DashboardPage() {
  const { me } = useSession();
  return (
    <>
      <PageHeader title={`Hello, ${me.name.split(' ')[0]}`} description="Here’s how to get started." />
      <Section title="Getting started">
        <ol className="space-y-3">
          {STEPS.map((s) => {
            const done = s.done(me.settings);
            return (
              <li key={s.href}>
                <Link href={s.href} className="flex items-center gap-3 rounded-md p-2 hover:bg-canvas">
                  {done ? <CheckCircle2 className="size-5 text-ok" aria-hidden /> : <Circle className="size-5 text-line-strong" aria-hidden />}
                  <span className={done ? 'text-muted-foreground line-through' : 'font-medium'}>{s.label}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </Section>
    </>
  );
}
