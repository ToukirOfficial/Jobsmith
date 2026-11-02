'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { cn } from '@/lib/utils';

export const SETTINGS_SECTIONS = [
  { href: '/app/settings', label: 'Job search' },
  { href: '/app/settings/ai', label: 'AI' },
  { href: '/app/settings/tools', label: 'Bookmarklet' },
  { href: '/app/settings/data', label: 'Your data' },
  { href: '/app/settings/account', label: 'Account' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <PageHeader title="Settings" description="Your job search preferences, account and tools." />
      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Settings" className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:flex-col">
          {SETTINGS_SECTIONS.map((s) => {
            const active = path === s.href;
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={active ? 'page' : undefined}
                className={cn('rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-ink/75 hover:bg-canvas-deep', active && 'bg-paper text-ink shadow-[inset_3px_0_0_var(--brand)]')}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
