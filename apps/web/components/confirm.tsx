'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { errorMessage } from '@/lib/api';

/** Wraps a trigger; asks before running a destructive or important action. */
export function Confirm({
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
  children,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? 'bg-bad hover:bg-bad/90' : undefined}
            disabled={pending}
            onClick={async (e) => {
              e.preventDefault();
              setPending(true);
              try {
                await onConfirm();
                setOpen(false);
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
