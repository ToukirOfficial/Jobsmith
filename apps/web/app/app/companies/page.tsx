'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Building2, Search } from 'lucide-react';
import type { CompanySummary } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { SponsorBadge } from '@/components/job-bits';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi } from '@/lib/use-api';

export default function CompaniesPage() {
  const { data, error, loading, reload } = useApi<CompanySummary[]>('/companies');
  const [q, setQ] = useState('');
  const rows = useMemo(() => (data ?? []).filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())), [data, q]);
  return (
    <>
      <PageHeader title="Companies" description="Created automatically from the jobs you save, with their UK sponsor status." />
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {loading && !data ? <ListSkeleton /> : null}
      {data && data.length === 0 ? (
        <EmptyState icon={Building2} title="No companies yet">
          Save a job and its company appears here, with the sponsor register check and every contact you add.
        </EmptyState>
      ) : null}
      {data && data.length > 0 ? (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a company" className="pl-9" aria-label="Find a company" />
          </div>
          <div className="rounded-lg border border-border bg-paper">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Company</TableHead>
                  <TableHead>UK sponsor register</TableHead>
                  <TableHead className="text-right">Applications</TableHead>
                  <TableHead className="pr-4 text-right">Contacts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4">
                      <Link href={`/app/companies/${c.id}`} className="font-semibold hover:text-brand">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <SponsorBadge sponsor={c.sponsor} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.applicationCount}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{c.contactCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}
    </>
  );
}
