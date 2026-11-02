'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

/** A dialog holding a short form. The form closes it by calling `close` after a successful save. */
export function FormDialog({
  title,
  description,
  trigger,
  open,
  onOpenChange,
  children,
  wide,
}: {
  title: string;
  description?: string;
  trigger?: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className={wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <div className="max-h-[70dvh] overflow-y-auto px-0.5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
