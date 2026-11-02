'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Mail, Plus, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { CONTACT_TYPE_LABELS, type ContactSummary } from '@jobsmith/shared';
import { ContactForm } from '@/components/contact-form';
import { FormDialog } from '@/components/form-dialog';
import { Section } from '@/components/section';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { api, errorMessage } from '@/lib/api';
import { useApi } from '@/lib/use-api';

export function ContactsSection({ applicationId, companyId, contacts, onChange }: { applicationId: string; companyId: string; contacts: ContactSummary[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'pick' | 'new'>('pick');
  const all = useApi<ContactSummary[]>(open ? '/contacts' : null);
  const [pick, setPick] = useState('');
  const available = (all.data ?? []).filter((c) => !contacts.some((x) => x.id === c.id));

  async function link() {
    if (!pick) return;
    try {
      await api(`/applications/${applicationId}/contacts`, { method: 'POST', body: { contactId: pick } });
      toast.success('Contact linked');
      setOpen(false);
      setPick('');
      onChange();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Section
      title="Contacts"
      flush
      actions={
        <FormDialog
          title="Add a contact"
          description="Recruiters, hiring managers, referrals and interviewers for this application."
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            setMode('pick');
          }}
          wide={mode === 'new'}
          trigger={
            <Button size="sm" variant="outline">
              <Plus className="size-4" aria-hidden /> Add
            </Button>
          }
        >
          {mode === 'pick' ? (
            <div className="space-y-4">
              {available.length ? (
                <div className="flex gap-2">
                  <NativeSelect value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Existing contact" className="flex-1">
                    <option value="">Choose someone you’ve already added</option>
                    {available.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.company ? ` (${c.company.name})` : ''}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button onClick={() => void link()} disabled={!pick}>
                    Link
                  </Button>
                </div>
              ) : null}
              <Button variant="outline" className="w-full" onClick={() => setMode('new')}>
                <Plus className="size-4" aria-hidden /> New contact
              </Button>
            </div>
          ) : (
            <ContactForm
              defaults={{ companyId, applicationIds: [applicationId] }}
              onSaved={() => {
                setOpen(false);
                onChange();
              }}
            />
          )}
        </FormDialog>
      }
    >
      {contacts.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={UserRound} title="No contacts yet" className="py-6">
            Add the recruiter or hiring manager so their details and your messages stay with this application.
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-5 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-canvas-deep text-sm font-bold text-ink-soft" aria-hidden>
                {c.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/app/contacts/${c.id}`} className="font-semibold hover:text-brand">
                  {c.name}
                </Link>
                <p className="truncate text-sm text-muted-foreground">
                  {CONTACT_TYPE_LABELS[c.type]}
                  {c.role ? `, ${c.role}` : ''}
                </p>
              </div>
              {c.email ? (
                <Button asChild size="icon" variant="ghost" aria-label={`Email ${c.name}`}>
                  <a href={`mailto:${c.email}`}>
                    <Mail className="size-4" />
                  </a>
                </Button>
              ) : null}
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Unlink ${c.name}`}
                onClick={async () => {
                  await api(`/applications/${applicationId}/contacts/${c.id}`, { method: 'DELETE' }).catch((e) => toast.error(errorMessage(e)));
                  onChange();
                }}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
