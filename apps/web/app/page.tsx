import Link from 'next/link';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';

/** Placeholder until the landing page (Phase 8). */
export default function Home() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start justify-center gap-6 px-5">
      <Logo />
      <h1 className="text-display font-bold tracking-tight">Your job search, organised.</h1>
      <p className="text-lg text-muted-foreground">A free, open-source, self-hosted job search workspace with an AI application agent.</p>
      <Button asChild size="lg">
        <Link href="/login">Open Jobsmith</Link>
      </Button>
    </main>
  );
}
