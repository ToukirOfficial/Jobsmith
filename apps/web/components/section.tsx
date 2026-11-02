import { cn } from '@/lib/utils';

/** A titled panel: the basic building block of record pages and settings. */
export function Section({ title, description, actions, children, className, flush }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn('rounded-lg border border-border bg-paper', className)}>
      {title || actions ? (
        <header className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? '' : 'px-5 py-4'}>{children}</div>
    </section>
  );
}
