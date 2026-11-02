'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CONTACT_TYPES, CONTACT_TYPE_LABELS, contactSchema, type CompanySummary, type ContactDetail, type ContactType } from '@jobsmith/shared';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from '@/lib/form';
import { useApi } from '@/lib/use-api';

export function ContactForm({
  contact,
  defaults,
  onSaved,
}: {
  contact?: ContactDetail;
  defaults?: { companyId?: string | null; applicationIds?: string[] };
  onSaved: (c: ContactDetail) => void;
}) {
  const companies = useApi<CompanySummary[]>('/companies');
  const [v, setV] = useState({
    name: contact?.name ?? '',
    type: (contact?.type ?? 'RECRUITER') as ContactType,
    companyId: contact?.company?.id ?? defaults?.companyId ?? '',
    role: contact?.role ?? '',
    email: contact?.email ?? '',
    linkedinUrl: contact?.linkedinUrl ?? '',
    notes: contact?.notes ?? '',
  });
  const form = useForm(contactSchema);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const body = { ...v, companyId: v.companyId || null, ...(contact ? {} : { applicationIds: defaults?.applicationIds ?? [] }) };
        const saved = contact ? await form.submit<ContactDetail>(body, `/contacts/${contact.id}`, { method: 'PATCH' }) : await form.submit<ContactDetail>(body, '/contacts');
        if (saved) {
          toast.success(contact ? 'Contact updated' : 'Contact added');
          onSaved(saved);
        }
      }}
    >
      <FormError message={form.formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={form.errors['name']}>
          {(p) => <Input {...p} value={v.name} onChange={set('name')} autoComplete="off" />}
        </Field>
        <Field label="Type">
          {(p) => (
            <NativeSelect {...p} value={v.type} onChange={set('type')}>
              {CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CONTACT_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Company" optional>
          {(p) => (
            <NativeSelect {...p} value={v.companyId} onChange={set('companyId')}>
              <option value="">No company</option>
              {(companies.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Their role" optional>
          {(p) => <Input {...p} value={v.role} onChange={set('role')} placeholder="Talent Partner" />}
        </Field>
        <Field label="Email" optional error={form.errors['email']}>
          {(p) => <Input {...p} type="email" value={v.email} onChange={set('email')} />}
        </Field>
        <Field label="LinkedIn profile" optional error={form.errors['linkedinUrl']}>
          {(p) => <Input {...p} type="url" value={v.linkedinUrl} onChange={set('linkedinUrl')} placeholder="https://www.linkedin.com/in/" />}
        </Field>
      </div>
      <Field label="Notes" optional>
        {(p) => <Textarea {...p} rows={3} value={v.notes} onChange={set('notes')} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={form.pending}>
          {form.pending ? 'Saving…' : contact ? 'Save changes' : 'Add contact'}
        </Button>
      </div>
    </form>
  );
}
