'use client';

import { useEffect, useRef, useState } from 'react';
import type { CvDocument, CvTemplate, LetterDocument } from '@jobsmith/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Input = { kind: 'cv'; doc: CvDocument; template: CvTemplate } | { kind: 'letter'; letter: LetterDocument };

/**
 * Live preview: the same react-pdf templates the worker uses, rendered in the browser (debounced) and
 * shown as a PDF. What you see here is what the exported PDF looks like.
 */
export function PdfPreview({ input, className }: { input: Input; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(true);
  const key = JSON.stringify(input);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const [{ pdf }, templates] = await Promise.all([import('@react-pdf/renderer'), import('@jobsmith/pdf')]);
        const parsed = JSON.parse(key) as Input;
        const element = parsed.kind === 'cv' ? <templates.CvPdf doc={parsed.doc} template={parsed.template} /> : <templates.LetterPdf letter={parsed.letter} />;
        const blob = await pdf(element).toBlob();
        if (n !== seq.current) return;
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
        setFailed(false);
      } catch {
        if (n === seq.current) setFailed(true);
      } finally {
        if (n === seq.current) setBusy(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [key]);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-border bg-canvas-deep', className)}>
      {url ? <iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title="PDF preview" className={cn('h-full w-full transition-opacity', busy && 'opacity-60')} /> : null}
      {!url && !failed ? <Skeleton className="absolute inset-4" aria-label="Preparing preview" /> : null}
      {failed ? <p className="absolute inset-x-4 top-4 rounded-md bg-paper p-3 text-sm text-muted-foreground">The preview couldn’t be drawn in this browser. Use “Download PDF” to see the file.</p> : null}
    </div>
  );
}
