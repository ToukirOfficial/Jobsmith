'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import { CONTACT_TYPE_LABELS, type ContactSummary } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { ContactForm } from '@/components/contact-form';
import { FormDialog } from '@/components/form-dialog';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApi } from '@/lib/use-api';

export default function ContactsPage() {
  const { data, error, loading, reload } = useApi<ContactSummary[]>('/contacts');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((c) => !t || c.name.toLowerCase().includes(t) || c.company?.name.toLowerCase().includes(t));
  }, [data, q]);
  const add = (
    <FormDialog
      title="Add a contact"
      open={open}
      onOpenChange={setOpen}
      wide
      trigger={
        <Button>
          <Plus className="size-4" aria-hidden /> Add contact
        </Button>
      }
    >
      <ContactForm
        onSaved={() => {
          setOpen(false);
          void reload();
        }}
      />
    </FormDialog>
  );
  return (
    <>
      <PageHeader title="Contacts" description="Recruiters, hiring managers, referrals and interviewers." actions={add} />
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {loading && !data ? <ListSkeleton /> : null}
      {data && data.length === 0 ? (
        <EmptyState icon={Users} title="No contacts yet">
          Add the people you talk to, link them to applications, and keep a simple log of what you sent and when.
        </EmptyState>
      ) : null}
      {data && data.length > 0 ? (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person or company" className="pl-9" aria-label="Find a contact" />
          </div>
          <div className="rounded-lg border border-border bg-paper">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="pr-4">Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4">
                      <Link href={`/app/contacts/${c.id}`} className="font-semibold hover:text-brand">
                        {c.name}
                      </Link>
                      {c.role ? <span className="block text-xs text-muted-foreground">{c.role}</span> : null}
                    </TableCell>
                    <TableCell>{CONTACT_TYPE_LABELS[c.type]}</TableCell>
                    <TableCell>{c.company ? <Link href={`/app/companies/${c.company.id}`} className="hover:text-brand">{c.company.name}</Link> : '—'}</TableCell>
                    <TableCell className="pr-4">{c.email ? <a href={`mailto:${c.email}`} className="hover:text-brand">{c.email}</a> : '—'}</TableCell>
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
