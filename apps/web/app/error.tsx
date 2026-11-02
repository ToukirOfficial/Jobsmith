'use client';

import { Button } from '@/components/ui/button';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
      <h1 className="text-title font-bold">This page didn’t load</h1>
      <p className="text-muted-foreground">Check your connection, then try again. If it keeps happening, reload the page.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
