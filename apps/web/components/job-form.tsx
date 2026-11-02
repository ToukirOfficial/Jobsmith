'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CURRENCIES, STAGE_LABELS, WORK_MODES, WORK_MODE_LABELS, type DuplicateMatch, type WorkMode } from '@jobsmith/shared';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

export interface JobValues {
  title: string;
  company: string;
  url: string;
  location: string;
  workMode: WorkMode | '';
  salaryMin: string;
  salaryMax: string;
  currency: string;
  closingDate: string;
  description: string;
}

export const emptyJob: JobValues = { title: '', company: '', url: '', location: '', workMode: '', salaryMin: '', salaryMax: '', currency: 'GBP', closingDate: '', description: '' };

const toPence = (s: string) => {
  const n = Number(s.replace(/[£€$,\s]/g, ''));
  return s.trim() && Number.isFinite(n) ? Math.round(n * 100) : null;
};
export const fromPence = (p: number | null | undefined) => (p == null ? '' : String(Math.round(p / 100)));

export function toBody(v: JobValues) {
  return {
    title: v.title,
    company: v.company,
    url: v.url || null,
    location: v.location || null,
    workMode: v.workMode || null,
    salaryMinPence: toPence(v.salaryMin),
    salaryMaxPence: toPence(v.salaryMax),
    currency: v.currency,
    closingDate: v.closingDate || null,
    description: v.description || null,
  };
}

/** Warns, never blocks, when the same company and role are already saved. */
function DuplicateWarning({ company, title, excludeId }: { company: string; title: string; excludeId?: string }) {
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  useEffect(() => {
    if (company.trim().length < 2 || title.trim().length < 2) {
      setMatches([]);
      return;
    }
    const t = setTimeout(() => {
      const p = new URLSearchParams({ company, title, ...(excludeId ? { excludeId } : {}) });
      api<DuplicateMatch[]>(`/applications/duplicates?${p.toString()}`)
        .then(setMatches)
        .catch(() => setMatches([]));
    }, 350);
    return () => clearTimeout(t);
  }, [company, title, excludeId]);
  if (!matches.length) return null;
  return (
    <div role="status" className="flex gap-3 rounded-md border border-warn/25 bg-warn-tint px-4 py-3 text-sm text-warn">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        You already saved this role at {matches[0]!.company}:{' '}
        {matches.map((m, i) => (
          <span key={m.id}>
            {i ? ', ' : ''}
            <Link href={`/app/applications/${m.id}`} className="font-semibold underline underline-offset-2">
              {m.title} ({STAGE_LABELS[m.stage]})
            </Link>
          </span>
        ))}
        . You can still save it again.
      </p>
    </div>
  );
}

export function JobForm({
  initial,
  submitLabel,
  excludeId,
  onSubmit,
  pending,
  formError,
  errors,
}: {
  initial: JobValues;
  submitLabel: string;
  excludeId?: string;
  onSubmit: (v: JobValues) => void;
  pending: boolean;
  formError: string | null;
  errors: Record<string, string>;
}) {
  const [v, setV] = useState<JobValues>(initial);
  useEffect(() => setV(initial), [initial]);
  const set = (k: keyof JobValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title" error={errors['title']}>
          {(p) => <Input {...p} value={v.title} onChange={set('title')} placeholder="Full-stack Developer" />}
        </Field>
        <Field label="Company" error={errors['company']}>
          {(p) => <Input {...p} value={v.company} onChange={set('company')} placeholder="Brightwave Ltd" />}
        </Field>
      </div>
      <DuplicateWarning company={v.company} title={v.title} excludeId={excludeId} />
      <Field label="Job link" optional error={errors['url']}>
        {(p) => <Input {...p} type="url" value={v.url} onChange={set('url')} placeholder="https://" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Location" optional error={errors['location']} className="sm:col-span-2">
          {(p) => <Input {...p} value={v.location} onChange={set('location')} placeholder="London" />}
        </Field>
        <Field label="Work mode" optional error={errors['workMode']}>
          {(p) => (
            <NativeSelect {...p} value={v.workMode} onChange={set('workMode')}>
              <option value="">Not stated</option>
              {WORK_MODES.map((m) => (
                <option key={m} value={m}>
                  {WORK_MODE_LABELS[m]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem_minmax(0,1fr)]">
        <Field label="Salary from" optional hint="Per year" error={errors['salaryMinPence']}>
          {(p) => <Input {...p} inputMode="numeric" value={v.salaryMin} onChange={set('salaryMin')} placeholder="42000" />}
        </Field>
        <Field label="Salary to" optional hint="Per year" error={errors['salaryMaxPence']}>
          {(p) => <Input {...p} inputMode="numeric" value={v.salaryMax} onChange={set('salaryMax')} placeholder="50000" />}
        </Field>
        <Field label="Currency">
          {(p) => (
            <NativeSelect {...p} value={v.currency} onChange={set('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Closing date" optional error={errors['closingDate']}>
          {(p) => <Input {...p} type="date" value={v.closingDate} onChange={set('closingDate')} />}
        </Field>
      </div>
      <Field label="Job description" optional hint="Used for the keyword match and by the agent." error={errors['description']}>
        {(p) => <Textarea {...p} rows={10} value={v.description} onChange={set('description')} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
