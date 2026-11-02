'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { CONTACT_TYPE_LABELS, LOG_CHANNELS, LOG_CHANNEL_LABELS, contactLogSchema, formatDateTime, type ContactDetail, type LogChannel, type LogDirection } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { Confirm } from '@/components/confirm';
import { ContactForm } from '@/components/contact-form';
import { Field } from '@/components/field';
import { FormDialog } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { StageBadge } from '@/components/job-bits';
import { Section } from '@/components/section';
import { ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { fromLocalInput, toLocalInput } from '@/lib/datetime';
import { useForm } from '@/lib/form';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

function LogForm({ c, onSaved }: { c: ContactDetail; onSaved: (c: ContactDetail) => void }) {
  const { tz } = useSession();
  const [v, setV] = useState({ direction: 'SENT' as LogDirection, channel: 'EMAIL' as LogChannel, at: toLocalInput(new Date().toISOString(), tz), note: '', applicationId: c.applications[0]?.id ?? '' });
  const form = useForm(contactLogSchema);
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const saved = await form.submit<ContactDetail>({ ...v, at: fromLocalInput(v.at, tz), applicationId: v.applicationId || null }, `/contacts/${c.id}/logs`);
        if (saved) {
          onSaved(saved);
          toast.success('Message logged');
        }
      }}
    >
      <FormError message={form.formError} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Direction">
          {(p) => (
            <NativeSelect {...p} value={v.direction} onChange={(e) => setV({ ...v, direction: e.target.value as LogDirection })}>
              <option value="SENT">I sent</option>
              <option value="RECEIVED">I received</option>
            </NativeSelect>
          )}
        </Field>
        <Field label="Channel">
          {(p) => (
            <NativeSelect {...p} value={v.channel} onChange={(e) => setV({ ...v, channel: e.target.value as LogChannel })}>
              {LOG_CHANNELS.map((ch) => (
                <option key={ch} value={ch}>
                  {LOG_CHANNEL_LABELS[ch]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="When" error={form.errors['at']}>
          {(p) => <Input {...p} type="datetime-local" value={v.at} onChange={(e) => setV({ ...v, at: e.target.value })} />}
        </Field>
      </div>
      {c.applications.length ? (
        <Field label="About" optional>
          {(p) => (
            <NativeSelect {...p} value={v.applicationId} onChange={(e) => setV({ ...v, applicationId: e.target.value })}>
              <option value="">No particular application</option>
              {c.applications.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} at {a.company}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      ) : null}
      <Field label="Note" error={form.errors['note']}>
        {(p) => <Textarea {...p} rows={3} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Thanked them for the call and sent my portfolio link." />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={form.pending}>
          {form.pending ? 'Saving…' : 'Log message'}
        </Button>
      </div>
    </form>
  );
}

export default function ContactPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { tz } = useSession();
  const { data: c, error, loading, reload, setData } = useApi<ContactDetail>(`/contacts/${id}`);
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !c) return <ListSkeleton />;
  if (!c) return null;
  return (
    <>
      <PageHeader
        back={{ href: '/app/contacts', label: 'Contacts' }}
        title={c.name}
        description={[CONTACT_TYPE_LABELS[c.type], c.role, c.company?.name].filter(Boolean).join(', ')}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> Edit
            </Button>
            <Confirm
              title={`Delete ${c.name}?`}
              description="Their message log is deleted too."
              confirmLabel="Delete"
              destructive
              onConfirm={async () => {
                await api(`/contacts/${c.id}`, { method: 'DELETE' });
                router.push('/app/contacts');
              }}
            >
              <Button variant="outline" size="icon" aria-label="Delete contact">
                <Trash2 className="size-4" />
              </Button>
            </Confirm>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Section
          title="Messages"
          description="A simple log you keep by hand. Nothing is sent from Jobsmith."
          flush
          actions={
            <FormDialog
              title="Log a message"
              open={logging}
              onOpenChange={setLogging}
              wide
              trigger={
                <Button size="sm" variant="outline">
                  <Plus className="size-4" aria-hidden /> Log message
                </Button>
              }
            >
              <LogForm
                c={c}
                onSaved={(x) => {
                  setData(x);
                  setLogging(false);
                }}
              />
            </FormDialog>
          }
        >
          {c.logs.length === 0 ? <p className="px-5 py-6 text-sm text-muted-foreground">No messages logged yet.</p> : null}
          <ul className="divide-y divide-border">
            {c.logs.map((l) => (
              <li key={l.id} className="flex gap-3 px-5 py-4">
                <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-full', l.direction === 'SENT' ? 'bg-brand-tint text-brand' : 'bg-ok-tint text-ok')}>
                  {l.direction === 'SENT' ? <ArrowUpRight className="size-4" aria-label="Sent" /> : <ArrowDownLeft className="size-4" aria-label="Received" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(l.at, tz)}, {LOG_CHANNEL_LABELS[l.channel]}
                    {l.application ? (
                      <>
                        {', '}
                        <Link href={`/app/applications/${l.application.id}`} className="hover:text-brand">
                          {l.application.title}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  <p className="text-sm whitespace-pre-line">{l.note}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete message"
                  onClick={async () => setData(await api<ContactDetail>(`/contacts/${c.id}/logs/${l.id}`, { method: 'DELETE' }))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Section>
        <aside className="space-y-6">
          <Section title="Details">
            <dl className="space-y-2 text-sm">
              {c.email ? (
                <div>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd>
                    <a href={`mailto:${c.email}`} className="text-brand hover:underline">
                      {c.email}
                    </a>
                  </dd>
                </div>
              ) : null}
              {c.linkedinUrl ? (
                <div>
                  <dt className="text-muted-foreground">LinkedIn</dt>
                  <dd>
                    <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand hover:underline">
                      Open profile
                    </a>
                  </dd>
                </div>
              ) : null}
              {c.notes ? (
                <div>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="whitespace-pre-line">{c.notes}</dd>
                </div>
              ) : null}
              {!c.email && !c.linkedinUrl && !c.notes ? <p className="text-muted-foreground">No details yet.</p> : null}
            </dl>
          </Section>
          <Section title="Applications" flush>
            <ul className="divide-y divide-border">
              {c.applications.map((a) => (
                <li key={a.id} className="space-y-1 px-5 py-3">
                  <Link href={`/app/applications/${a.id}`} className="block font-semibold hover:text-brand">
                    {a.title}
                  </Link>
                  <span className="flex items-center justify-between text-sm text-muted-foreground">
                    {a.company} <StageBadge stage={a.stage} />
                  </span>
                </li>
              ))}
              {!c.applications.length ? <li className="px-5 py-4 text-sm text-muted-foreground">Not linked to any application.</li> : null}
            </ul>
          </Section>
        </aside>
      </div>
      <FormDialog title="Edit contact" open={editing} onOpenChange={setEditing} wide>
        <ContactForm
          contact={c}
          onSaved={(x) => {
            setData(x);
            setEditing(false);
          }}
        />
      </FormDialog>
    </>
  );
}
