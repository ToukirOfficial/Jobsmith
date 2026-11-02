'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, LayoutList, Plus, Search } from 'lucide-react';
import { CHANNEL_LABELS, STAGES, STAGE_LABELS, formatDate, type ApplicationSummary, type Page, type Stage } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { DaysInStage, Salary, SponsorBadge, StageBadge } from '@/components/job-bits';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

type Sort = 'updated' | 'company' | 'title' | 'stage' | 'closing' | 'applied';

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SortHead({ label, k, sort, dir, onSort, className }: { label: string; k: Sort; sort: Sort; dir: 'asc' | 'desc'; onSort: (k: Sort) => void; className?: string }) {
  const active = sort === k;
  return (
    <TableHead className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1 font-semibold hover:text-ink', active && 'text-ink')}>
        {label}
        {active ? dir === 'asc' ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden /> : null}
      </button>
    </TableHead>
  );
}

export default function ApplicationsPage() {
  const { tz } = useSession();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<Stage | ''>('');
  const [sponsor, setSponsor] = useState<'' | 'yes' | 'no' | 'unknown'>('');
  const [archived, setArchived] = useState<'false' | 'true' | 'all'>('false');
  const [sort, setSort] = useState<Sort>('updated');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const search = useDebounced(q);

  const path = useMemo(() => {
    const p = new URLSearchParams({ sort, dir, archived });
    if (search.trim()) p.set('q', search.trim());
    if (stage) p.set('stage', stage);
    if (sponsor) p.set('sponsor', sponsor);
    return `/applications?${p.toString()}`;
  }, [search, stage, sponsor, archived, sort, dir]);
  const { data, error, loading, reload } = useApi<Page<ApplicationSummary>>(path);

  const onSort = (k: Sort) => {
    if (k === sort) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setSort(k);
      setDir(k === 'updated' || k === 'applied' ? 'desc' : 'asc');
    }
  };
  const filtered = !!(search || stage || sponsor || archived !== 'false');

  return (
    <>
      <PageHeader
        title="Applications"
        description="Every job you’ve saved or applied for."
        actions={
          <Button asChild>
            <Link href="/app/applications/new">
              <Plus className="size-4" aria-hidden /> Save a job
            </Link>
          </Button>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search role, company or location" className="pl-9" aria-label="Search applications" />
        </div>
        <NativeSelect value={stage} onChange={(e) => setStage(e.target.value as Stage | '')} aria-label="Stage">
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={sponsor} onChange={(e) => setSponsor(e.target.value as typeof sponsor)} aria-label="Sponsor status">
          <option value="">Any sponsor status</option>
          <option value="yes">Licensed sponsor</option>
          <option value="no">Not on register</option>
          <option value="unknown">Not checked</option>
        </NativeSelect>
        <NativeSelect value={archived} onChange={(e) => setArchived(e.target.value as typeof archived)} aria-label="Archived">
          <option value="false">Active</option>
          <option value="true">Archived</option>
          <option value="all">Active and archived</option>
        </NativeSelect>
      </div>

      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {loading && !data ? <ListSkeleton rows={8} /> : null}
      {data && data.items.length === 0 ? (
        filtered ? (
          <EmptyState icon={Search} title="Nothing matches">
            Try a different search, or clear the filters.
          </EmptyState>
        ) : (
          <EmptyState
            icon={LayoutList}
            title="No applications yet"
            action={
              <Button asChild>
                <Link href="/app/applications/new">Save your first job</Link>
              </Button>
            }
          >
            Saved jobs and applications appear here, with filters for stage, sponsor status and dates.
          </EmptyState>
        )
      ) : null}
      {data && data.items.length > 0 ? (
        <div className={cn('rounded-lg border border-border bg-paper', loading && 'opacity-70')}>
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label="Role" k="title" sort={sort} dir={dir} onSort={onSort} className="pl-4" />
                <SortHead label="Company" k="company" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Stage" k="stage" sort={sort} dir={dir} onSort={onSort} />
                <TableHead>Sponsor</TableHead>
                <TableHead>Salary</TableHead>
                <SortHead label="Applied" k="applied" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Closes" k="closing" sort={sort} dir={dir} onSort={onSort} />
                <SortHead label="Updated" k="updated" sort={sort} dir={dir} onSort={onSort} className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => router.push(`/app/applications/${a.id}`)}>
                  <TableCell className="pl-4">
                    <Link href={`/app/applications/${a.id}`} className="font-semibold text-ink hover:text-brand" onClick={(e) => e.stopPropagation()}>
                      {a.title}
                    </Link>
                    {a.location ? <span className="block text-xs text-muted-foreground">{a.location}</span> : null}
                  </TableCell>
                  <TableCell>{a.company.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <StageBadge stage={a.stage} />
                      <DaysInStage since={a.stageChangedAt} tz={tz} stage={a.stage} />
                    </span>
                  </TableCell>
                  <TableCell>
                    <SponsorBadge sponsor={a.sponsor} />
                  </TableCell>
                  <TableCell>
                    <Salary min={a.salaryMinPence} max={a.salaryMaxPence} currency={a.currency} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {a.appliedAt ? formatDate(a.appliedAt, tz) : '—'}
                    {a.channel ? <span className="block text-xs text-muted-foreground">{CHANNEL_LABELS[a.channel]}</span> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{a.closingDate ? formatDate(a.closingDate, 'UTC') : '—'}</TableCell>
                  <TableCell className="pr-4 whitespace-nowrap text-muted-foreground">{formatDate(a.updatedAt, tz)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </>
  );
}
