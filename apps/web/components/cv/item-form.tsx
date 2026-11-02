'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { profileItemSchema, type ProfileDto, type ProfileItemDto, type ProfileKind } from '@jobsmith/shared';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from '@/lib/form';

type Values = Record<string, string>;
const BULLETS: ProfileKind[] = ['EXPERIENCE', 'PROJECT', 'EDUCATION'];

const FIELDS: Record<ProfileKind, { key: string; label: string; placeholder?: string; optional?: boolean; type?: 'month' | 'url' | 'textarea'; half?: boolean }[]> = {
  EXPERIENCE: [
    { key: 'role', label: 'Job title', placeholder: 'Software Developer', half: true },
    { key: 'organisation', label: 'Organisation', placeholder: 'Fernleaf Studio', half: true },
    { key: 'location', label: 'Location', optional: true, placeholder: 'Leeds' },
    { key: 'start', label: 'Started', type: 'month', optional: true, half: true },
    { key: 'end', label: 'Finished', type: 'month', optional: true, half: true },
  ],
  PROJECT: [
    { key: 'name', label: 'Project name', placeholder: 'Jobsmith' },
    { key: 'url', label: 'Link', type: 'url', optional: true, placeholder: 'https://' },
    { key: 'summary', label: 'One-line summary', optional: true, placeholder: 'Self-hosted job search tracker with an AI agent' },
  ],
  SKILLS: [
    { key: 'group', label: 'Group', placeholder: 'Languages' },
    { key: 'skills', label: 'Skills', placeholder: 'TypeScript, SQL, Python' },
  ],
  EDUCATION: [
    { key: 'qualification', label: 'Qualification', placeholder: 'MSc Computer Science' },
    { key: 'institution', label: 'Institution', placeholder: 'University of Leeds', half: true },
    { key: 'location', label: 'Location', optional: true, half: true },
    { key: 'start', label: 'Started', type: 'month', optional: true, half: true },
    { key: 'end', label: 'Finished', type: 'month', optional: true, half: true },
    { key: 'detail', label: 'Detail', optional: true, placeholder: 'Distinction. Dissertation on…' },
  ],
  CERTIFICATION: [
    { key: 'name', label: 'Name', placeholder: 'AWS Certified Developer – Associate' },
    { key: 'issuer', label: 'Issued by', optional: true, half: true },
    { key: 'date', label: 'Date', type: 'month', optional: true, half: true },
  ],
  LINK: [
    { key: 'label', label: 'Label', placeholder: 'GitHub', half: true },
    { key: 'url', label: 'Link', type: 'url', placeholder: 'https://github.com/…', half: true },
  ],
};

function toValues(item?: ProfileItemDto): Values {
  if (!item) return {};
  const d = item.data as Record<string, unknown>;
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')]));
}

function toData(kind: ProfileKind, v: Values) {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS[kind]) {
    const raw = (v[f.key] ?? '').trim();
    if (kind === 'SKILLS' && f.key === 'skills') out[f.key] = raw.split(',').map((s) => s.trim()).filter(Boolean);
    else if (raw || !f.optional) out[f.key] = raw;
  }
  return out;
}

export function ItemForm({ kind, item, onSaved }: { kind: ProfileKind; item?: ProfileItemDto; onSaved: (p: ProfileDto) => void }) {
  const [v, setV] = useState<Values>(toValues(item));
  const [bullets, setBullets] = useState<{ id?: string; text: string }[]>(item?.bullets.map((b) => ({ id: b.id, text: b.text })) ?? (BULLETS.includes(kind) ? [{ text: '' }] : []));
  const form = useForm(profileItemSchema);
  const move = (i: number, d: -1 | 1) =>
    setBullets((b) => {
      const n = [...b];
      const [x] = n.splice(i, 1);
      n.splice(i + d, 0, x!);
      return n;
    });

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const body = { kind, data: toData(kind, v), bullets: bullets.filter((b) => b.text.trim()) };
        const saved = item ? await form.submit<ProfileDto>(body, `/profile/items/${item.id}`, { method: 'PUT' }) : await form.submit<ProfileDto>(body, '/profile/items');
        if (saved) {
          toast.success(item ? 'Saved' : 'Added to your profile');
          onSaved(saved);
        }
      }}
    >
      <FormError message={form.formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS[kind].map((f) => (
          <Field key={f.key} label={f.label} optional={f.optional} error={form.errors[`data.${f.key}`]} className={f.half ? '' : 'sm:col-span-2'} hint={kind === 'SKILLS' && f.key === 'skills' ? 'Separate with commas.' : undefined}>
            {(p) => <Input {...p} type={f.type === 'month' ? 'month' : f.type === 'url' ? 'url' : 'text'} value={v[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}
          </Field>
        ))}
      </div>
      {BULLETS.includes(kind) ? (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Bullet points</legend>
          <p className="text-xs text-muted-foreground">Start with a verb, add a number if you have one. Each CV version picks which bullets to show.</p>
          {bullets.map((b, i) => (
            <div key={b.id ?? `new-${i}`} className="flex items-start gap-1">
              <Textarea
                rows={2}
                value={b.text}
                aria-label={`Bullet ${i + 1}`}
                onChange={(e) => setBullets((x) => x.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))}
                className="min-h-0 flex-1"
              />
              <div className="flex flex-col">
                <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Move down" disabled={i === bullets.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-3.5" />
                </Button>
              </div>
              <Button type="button" size="icon" variant="ghost" aria-label="Remove bullet" onClick={() => setBullets((x) => x.filter((_, j) => j !== i))}>
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setBullets((x) => [...x, { text: '' }])}>
            <Plus className="size-4" aria-hidden /> Add a bullet
          </Button>
        </fieldset>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={form.pending}>
          {form.pending ? 'Saving…' : item ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  );
}
