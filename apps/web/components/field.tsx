'use client';

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Label, control, hint and error, wired together for screen readers. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
      </Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}
