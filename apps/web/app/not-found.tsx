import Link from 'next/link';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6">
      <Logo />
      <h1 className="text-title font-bold">This page isn’t here</h1>
      <p className="text-muted-foreground">The link may be old, or the page was moved. Head back and try again from the menu.</p>
      <Button asChild>
        <Link href="/app">Go to your dashboard</Link>
      </Button>
    </main>
  );
}
