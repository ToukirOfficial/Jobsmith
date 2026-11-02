'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CV_TEMPLATE_LABELS,
  PROFILE_KIND_LABELS,
  formatDate,
  formatMonth,
  profileContactSchema,
  type CvVersionDto,
  type ProfileContact,
  type ProfileDto,
  type ProfileItemDto,
  type ProfileKind,
} from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { Confirm } from '@/components/confirm';
import { ItemForm } from '@/components/cv/item-form';
import { Field } from '@/components/field';
import { FormDialog } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { Section } from '@/components/section';
import { ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { useForm } from '@/lib/form';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

const KINDS: ProfileKind[] = ['EXPERIENCE', 'PROJECT', 'SKILLS', 'EDUCATION', 'CERTIFICATION', 'LINK'];
const ADD_LABEL: Record<ProfileKind, string> = { EXPERIENCE: 'Add a job', PROJECT: 'Add a project', SKILLS: 'Add a skill group', EDUCATION: 'Add education', CERTIFICATION: 'Add a certification', LINK: 'Add a link' };

function summaryOf(i: ProfileItemDto): { title: string; sub: string } {
  switch (i.kind) {
    case 'EXPERIENCE':
      return { title: i.data.role, sub: [i.data.organisation, [formatMonth(i.data.start), i.data.end ? formatMonth(i.data.end) : i.data.start ? 'Present' : ''].filter(Boolean).join(' – ')].filter(Boolean).join(', ') };
    case 'PROJECT':
      return { title: i.data.name, sub: i.data.summary ?? '' };
    case 'SKILLS':
      return { title: i.data.group, sub: i.data.skills.join(', ') };
    case 'EDUCATION':
      return { title: i.data.qualification, sub: i.data.institution };
    case 'CERTIFICATION':
      return { title: i.data.name, sub: [i.data.issuer, formatMonth(i.data.date)].filter(Boolean).join(', ') };
    case 'LINK':
      return { title: i.data.label, sub: i.data.url };
  }
}

function ContactForm({ contact, onSaved }: { contact: ProfileContact; onSaved: (p: ProfileDto) => void }) {
  const [v, setV] = useState({ ...contact, email: contact.email ?? '', phone: contact.phone ?? '', location: contact.location ?? '', headline: contact.headline ?? '', summary: contact.summary ?? '' });
  const form = useForm(profileContactSchema);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const saved = await form.submit<ProfileDto>(v, '/profile/contact', { method: 'PUT' });
        if (saved) {
          onSaved(saved);
          toast.success('Contact details saved');
        }
      }}
    >
      <FormError message={form.formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={form.errors['fullName']}>
          {(p) => <Input {...p} value={v.fullName} onChange={set('fullName')} autoComplete="name" />}
        </Field>
        <Field label="Email" optional error={form.errors['email']}>
          {(p) => <Input {...p} type="email" value={v.email} onChange={set('email')} />}
        </Field>
        <Field label="Phone" optional>
          {(p) => <Input {...p} value={v.phone} onChange={set('phone')} autoComplete="tel" />}
        </Field>
        <Field label="Location" optional hint="City is enough. No street address on a CV.">
          {(p) => <Input {...p} value={v.location} onChange={set('location')} placeholder="Manchester, UK" />}
        </Field>
      </div>
      <Field label="Headline" optional hint="One line under your name. Each CV version can override it.">
        {(p) => <Input {...p} value={v.headline} onChange={set('headline')} placeholder="Full-stack developer (TypeScript, React, Node.js)" />}
      </Field>
      <Field label="Summary" optional hint="Two or three plain sentences. Versions can override it too.">
        {(p) => <Textarea {...p} rows={4} value={v.summary} onChange={set('summary')} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={form.pending}>
          {form.pending ? 'Saving…' : 'Save contact details'}
        </Button>
      </div>
    </form>
  );
}

function KindSection({ kind, items, onChange }: { kind: ProfileKind; items: ProfileItemDto[]; onChange: (p: ProfileDto) => void }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProfileItemDto | null>(null);
  async function move(i: number, d: -1 | 1) {
    const ids = items.map((x) => x.id);
    const [x] = ids.splice(i, 1);
    ids.splice(i + d, 0, x!);
    try {
      onChange(await api<ProfileDto>('/profile/items/reorder', { method: 'POST', body: { ids } }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  return (
    <Section
      title={PROFILE_KIND_LABELS[kind]}
      flush
      actions={
        <FormDialog
          title={ADD_LABEL[kind]}
          open={adding}
          onOpenChange={setAdding}
          wide
          trigger={
            <Button size="sm" variant="outline">
              <Plus className="size-4" aria-hidden /> {ADD_LABEL[kind]}
            </Button>
          }
        >
          <ItemForm
            kind={kind}
            onSaved={(p) => {
              onChange(p);
              setAdding(false);
            }}
          />
        </FormDialog>
      }
    >
      {items.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">Nothing here yet.</p> : null}
      <ul className="divide-y divide-border">
        {items.map((it, i) => {
          const s = summaryOf(it);
          return (
            <li key={it.id} className="flex items-start gap-2 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.title}</p>
                {s.sub ? <p className="truncate text-sm text-muted-foreground">{s.sub}</p> : null}
                {it.bullets.length ? <p className="mt-0.5 text-xs text-ink-soft">{it.bullets.length} bullet{it.bullets.length === 1 ? '' : 's'}</p> : null}
              </div>
              <div className="flex shrink-0 items-center">
                <Button size="icon" variant="ghost" className="size-8" aria-label="Move up" disabled={i === 0} onClick={() => void move(i, -1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label="Move down" disabled={i === items.length - 1} onClick={() => void move(i, 1)}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit ${s.title}`} onClick={() => setEditing(it)}>
                  <Pencil className="size-4" />
                </Button>
                <Confirm title={`Delete ${s.title}?`} description="It disappears from every CV version. CVs you already sent are kept exactly as they were." confirmLabel="Delete" destructive onConfirm={async () => onChange(await api<ProfileDto>(`/profile/items/${it.id}`, { method: 'DELETE' }))}>
                  <Button size="icon" variant="ghost" className="size-8" aria-label={`Delete ${s.title}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </Confirm>
              </div>
            </li>
          );
        })}
      </ul>
      <FormDialog title={`Edit ${PROFILE_KIND_LABELS[kind].toLowerCase()}`} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} wide>
        {editing ? (
          <ItemForm
            kind={kind}
            item={editing}
            onSaved={(p) => {
              onChange(p);
              setEditing(null);
            }}
          />
        ) : null}
      </FormDialog>
    </Section>
  );
}

function Versions({ hasItems }: { hasItems: boolean }) {
  const router = useRouter();
  const { tz } = useSession();
  const { data, error, loading, reload } = useApi<CvVersionDto[]>('/cv-versions');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  async function create() {
    setCreating(true);
    try {
      const v = await api<CvVersionDto>('/cv-versions', { method: 'POST', body: { name: name.trim() || 'General', template: 'CLASSIC' } });
      router.push(`/app/cv/${v.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setCreating(false);
    }
  }
  return (
    <Section title="CV versions" description="Each version picks items and bullets from your profile, with its own headline and template.">
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {loading && !data ? <ListSkeleton rows={2} /> : null}
      <ul className="space-y-2">
        {(data ?? []).map((v) => (
          <li key={v.id} className="group flex items-center gap-3 rounded-md border border-border p-3 hover:border-line-strong">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-tint text-brand">
              <FileText className="size-5" aria-hidden />
            </span>
            <Link href={`/app/cv/${v.id}`} className="min-w-0 flex-1">
              <span className="block font-semibold group-hover:text-brand">{v.name}</span>
              <span className="block text-xs text-muted-foreground">
                {CV_TEMPLATE_LABELS[v.template]} template, edited {formatDate(v.updatedAt, tz)}
              </span>
            </Link>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Duplicate ${v.name}`}
              onClick={async () => {
                await api(`/cv-versions/${v.id}/duplicate`, { method: 'POST' });
                void reload();
              }}
            >
              <Copy className="size-4" />
            </Button>
            <Confirm title={`Delete ${v.name}?`} description="CVs you already sent with it are kept exactly as they were." confirmLabel="Delete" destructive onConfirm={async () => {
              await api(`/cv-versions/${v.id}`, { method: 'DELETE' });
              void reload();
            }}>
              <Button size="icon" variant="ghost" aria-label={`Delete ${v.name}`}>
                <Trash2 className="size-4" />
              </Button>
            </Confirm>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New version name, e.g. Legal-tech" aria-label="New version name" maxLength={80} />
        <Button type="submit" disabled={creating || !hasItems}>
          <Plus className="size-4" aria-hidden /> Create
        </Button>
      </form>
      {!hasItems ? <p className="mt-2 text-xs text-muted-foreground">Add at least one job, project or skill group to your profile first.</p> : null}
    </Section>
  );
}

export default function CvPage() {
  const { data, error, loading, reload, setData } = useApi<ProfileDto>('/profile');
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <>
      <PageHeader title="CV builder" description="Write your experience once. Make as many tailored versions as you need." />
      {error ? <ErrorState error={error} onRetry={reload} /> : null}
      {loading && !data ? <ListSkeleton rows={6} /> : null}
      {data && ready ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-6 xl:order-1">
            <Section title="Contact details and summary">
              <ContactForm contact={data.contact} onSaved={setData} />
            </Section>
            {KINDS.map((k) => (
              <KindSection key={k} kind={k} items={data.items.filter((i) => i.kind === k)} onChange={setData} />
            ))}
          </div>
          <aside className="xl:order-2">
            <div className="xl:sticky xl:top-20">
              <Versions hasItems={data.items.some((i) => i.kind !== 'LINK')} />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
