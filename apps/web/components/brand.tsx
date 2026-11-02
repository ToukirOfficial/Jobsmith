import { cn } from '@/lib/utils';

/** The Jobsmith mark: a forged "J" on an indigo tile, with an ember spark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('h-7 w-7', className)}>
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <path d="M19.5 8v10.25a5.25 5.25 0 0 1-10.5 0" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M15 8h8.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="24.6" cy="22.2" r="2.4" fill="var(--spark)" />
    </svg>
  );
}

export function Logo({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className={cn('text-[1.2rem] font-extrabold tracking-[-0.03em]', tone === 'light' ? 'text-white' : 'text-ink')}>
        Job<span className={cn('font-semibold', tone === 'light' ? 'text-white/85' : 'text-brand')}>smith</span>
      </span>
    </span>
  );
}
