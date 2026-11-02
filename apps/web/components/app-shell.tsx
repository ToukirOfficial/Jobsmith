'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  FileText,
  KanbanSquare,
  LayoutList,
  LogOut,
  Mail,
  Menu,
  Plus,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { DemoBanner } from '@/components/demo-banner';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV: NavItem[][] = [
  [
    { href: '/app', label: 'Dashboard', icon: BarChart3 },
    { href: '/app/board', label: 'Board', icon: KanbanSquare },
    { href: '/app/applications', label: 'Applications', icon: LayoutList },
  ],
  [
    { href: '/app/cv', label: 'CV builder', icon: FileText },
    { href: '/app/letters', label: 'Cover letters', icon: Mail },
    { href: '/app/companies', label: 'Companies', icon: Building2 },
    { href: '/app/contacts', label: 'Contacts', icon: Users },
  ],
  [
    { href: '/app/calendar', label: 'Calendar', icon: CalendarDays },
    { href: '/app/reminders', label: 'Reminders', icon: Bell },
  ],
  [{ href: '/app/settings', label: 'Settings', icon: Settings }],
];

function isActive(path: string, href: string) {
  return href === '/app' ? path === '/app' : path === href || path.startsWith(`${href}/`);
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-4 px-3">
      {NAV.map((group, i) => (
        <ul key={i} className="space-y-0.5">
          {group.map((item) => {
              const active = isActive(path, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-[0.9rem] font-medium text-ink/80 transition-colors hover:bg-canvas-deep hover:text-ink',
                      active && 'bg-brand-tint text-brand hover:bg-brand-tint hover:text-brand',
                    )}
                  >
                    <item.icon className="size-[18px] shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
        </ul>
      ))}
    </nav>
  );
}

function NewJobButton({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Button asChild className="w-full justify-start gap-2" onClick={onNavigate}>
      <Link href="/app/applications/new">
        <Plus className="size-4" aria-hidden /> Save a job
      </Link>
    </Button>
  );
}

function UserMenu() {
  const { me, logout } = useSession();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <span className="grid size-8 place-items-center rounded-full bg-canvas-deep text-sm font-semibold" aria-hidden>
            {me.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-40 truncate text-sm sm:inline">{me.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block font-semibold">{me.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{me.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut className="size-4" aria-hidden /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-paper focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-5 border-r border-border bg-paper py-5 lg:flex">
        <Link href="/app" className="px-6" aria-label="Jobsmith dashboard">
          <Logo />
        </Link>
        <div className="px-3">
          <NewJobButton />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Nav />
        </div>
      </aside>
      <div className="lg:pl-64">
        <DemoBanner />
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-canvas/90 px-4 backdrop-blur sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-5 bg-paper py-5">
              <SheetTitle className="px-6">
                <Logo />
              </SheetTitle>
              <div className="px-3">
                <NewJobButton onNavigate={() => setOpen(false)} />
              </div>
              <div className="overflow-y-auto">
                <Nav onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <Link href="/app" className="lg:hidden" aria-label="Jobsmith dashboard">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <UserMenu />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Page title row: heading, one-line description, actions on the right. */
export function PageHeader({ title, description, actions, back }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {back ? (
          <Link href={back.href} className="text-sm text-muted-foreground hover:text-ink">
            ‹ {back.label}
          </Link>
        ) : null}
        <h1 className="text-title font-bold">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
