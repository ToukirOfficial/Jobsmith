import type { LucideIcon } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

/** An empty list that says what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-lg border border-dashed border-line-strong bg-paper/60 px-6 py-8 sm:items-center sm:text-center', className)}>
      <span className="grid size-11 place-items-center rounded-full bg-brand-tint text-brand">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <h3 className="font-semibold">{title}</h3>
        {children ? <div className="max-w-prose text-sm text-muted-foreground">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-bad/25 bg-bad-tint px-5 py-4 text-bad sm:flex-row sm:items-center">
      <AlertTriangle className="size-5 shrink-0" aria-hidden />
      <p className="flex-1 text-sm font-medium">{errorMessage(error)}</p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Loading placeholders shaped like what's coming (no spinners). */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}
