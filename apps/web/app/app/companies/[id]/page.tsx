'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BadgeCheck, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { CONTACT_TYPE_LABELS, companyUpdateSchema, type CompanyDetail } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { SponsorBadge, StageBadge } from '@/components/job-bits';
import { Section } from '@/components/section';
import { ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { useForm } from '@/lib/form';
import { useApi } from '@/lib/use-api';

function SponsorPanel({ c, onChange }: { c: CompanyDetail; onChange: (c: CompanyDetail) => void }) {
  async function confirm(name: string | null) {
    try {
      onChange(await api<CompanyDetail>(`/companies/${c.id}`, { method: 'PATCH', body: { sponsorName: name } }));
      toast.success(name ? 'Sponsor match confirmed' : 'Sponsor match cleared');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  return (
    <Section title="UK visa sponsorship" description="From the Home Office register of licensed sponsors (workers), updated daily.">
      <div className="space-y-3 text-sm">
        <SponsorBadge sponsor={c.sponsor} />
        {c.sponsor.status === 'LICENSED' ? (
          <dl className="space-y-1">
            <div>
              <dt className="inline text-muted-foreground">Register name: </dt>
              <dd className="inline font-medium">{c.sponsor.sponsorName}</dd>
            </div>
            {c.sponsor.town ? (
              <div>
                <dt className="inline text-muted-foreground">Town: </dt>
                <dd className="inline">{c.sponsor.town}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline text-muted-foreground">Routes: </dt>
              <dd className="inline">{c.sponsor.routes.join(', ')}</dd>
            </div>
            {c.sponsor.rating ? (
              <div>
                <dt className="inline text-muted-foreground">Type and rating: </dt>
                <dd className="inline">{c.sponsor.rating}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <p className="text-muted-foreground">Licensed to sponsor means the company can sponsor visas. It doesn’t mean this job will. Check the job advert or ask the recruiter.</p>
        {c.possibleSponsors.length ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="font-medium">Is it one of these?</p>
            <ul className="space-y-2">
              {c.possibleSponsors.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-2">
                  <span>
                    {s.name}
                    <span className="block text-xs text-muted-foreground">
                      {[s.town, s.routes.join(', ')].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => void confirm(s.name)}>
                    <BadgeCheck className="size-4" aria-hidden /> That’s it
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function CompanyForm({ c, onSaved }: { c: CompanyDetail; onSaved: (c: CompanyDetail) => void }) {
  const [v, setV] = useState({ name: c.name, website: c.website ?? '', notes: c.notes ?? '' });
  useEffect(() => setV({ name: c.name, website: c.website ?? '', notes: c.notes ?? '' }), [c]);
  const form = useForm(companyUpdateSchema);
  return (
    <Section title="About the company">
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const saved = await form.submit<CompanyDetail>({ name: v.name, website: v.website || null, notes: v.notes || null }, `/companies/${c.id}`, { method: 'PATCH' });
          if (saved) {
            onSaved(saved);
            toast.success('Company saved');
          }
        }}
      >
        <FormError message={form.formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={form.errors['name']}>
            {(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}
          </Field>
          <Field label="Website" optional error={form.errors['website']}>
            {(p) => <Input {...p} type="url" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} placeholder="https://" />}
          </Field>
        </div>
        <Field label="Notes" optional hint="Culture, tech stack, what you’ve heard.">
          {(p) => <Textarea {...p} rows={4} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />}
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={form.pending}>
            {form.pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Section>
  );
}

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const { data: c, error, loading, reload, setData } = useApi<CompanyDetail>(`/companies/${id}`);
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !c) return <ListSkeleton />;
  if (!c) return null;
  return (
    <>
      <PageHeader
        back={{ href: '/app/companies', label: 'Companies' }}
        title={c.name}
        actions={
          c.website ? (
            <Button asChild variant="outline">
              <a href={c.website} target="_blank" rel="noopener noreferrer nofollow">
                Website <ExternalLink className="size-4" aria-hidden />
              </a>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Applications" flush>
            <ul className="divide-y divide-border">
              {c.applications.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <Link href={`/app/applications/${a.id}`} className="font-semibold hover:text-brand">
                    {a.title}
                  </Link>
                  <StageBadge stage={a.stage} />
                </li>
              ))}
              {!c.applications.length ? <li className="px-5 py-4 text-sm text-muted-foreground">No applications at this company.</li> : null}
            </ul>
          </Section>
          <Section title="Contacts" flush>
            <ul className="divide-y divide-border">
              {c.contacts.map((p) => (
                <li key={p.id} className="px-5 py-3">
                  <Link href={`/app/contacts/${p.id}`} className="font-semibold hover:text-brand">
                    {p.name}
                  </Link>
                  <span className="block text-sm text-muted-foreground">
                    {CONTACT_TYPE_LABELS[p.type]}
                    {p.role ? `, ${p.role}` : ''}
                  </span>
                </li>
              ))}
              {!c.contacts.length ? <li className="px-5 py-4 text-sm text-muted-foreground">No contacts here yet. Add them from an application.</li> : null}
            </ul>
          </Section>
          <CompanyForm c={c} onSaved={setData} />
        </div>
        <aside>
          <SponsorPanel c={c} onChange={setData} />
        </aside>
      </div>
    </>
  );
}
