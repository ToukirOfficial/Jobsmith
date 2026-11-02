'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  CV_TEMPLATES,
  CV_TEMPLATE_LABELS,
  CV_TEMPLATE_NOTES,
  PROFILE_KIND_LABELS,
  buildCvDocument,
  type CvSelection,
  type CvVersionDto,
  type ProfileDto,
  type ProfileItemDto,
  type ProfileKind,
} from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { Field } from '@/components/field';
import { PdfPreview } from '@/components/pdf-preview';
import { Section } from '@/components/section';
import { ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { usePdfDownload } from '@/lib/pdf-job';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const ORDERED: ProfileKind[] = ['EXPERIENCE', 'PROJECT', 'SKILLS', 'EDUCATION', 'CERTIFICATION'];

function itemTitle(i: ProfileItemDto): string {
  switch (i.kind) {
    case 'EXPERIENCE':
      return `${i.data.role}, ${i.data.organisation}`;
    case 'PROJECT':
      return i.data.name;
    case 'SKILLS':
      return `${i.data.group}: ${i.data.skills.join(', ')}`;
    case 'EDUCATION':
      return `${i.data.qualification}, ${i.data.institution}`;
    case 'CERTIFICATION':
      return i.data.name;
    case 'LINK':
      return i.data.label;
  }
}

function Editor({ profile, initial }: { profile: ProfileDto; initial: CvVersionDto }) {
  const [v, setV] = useState(initial);
  const [status, setStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const pdf = usePdfDownload();
  const first = useRef(true);
  const saving = useRef<Promise<unknown> | null>(null);

  // Autosave a second after the last change.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus('dirty');
    const t = setTimeout(() => {
      setStatus('saving');
      saving.current = api<CvVersionDto>(`/cv-versions/${v.id}`, { method: 'PATCH', body: { name: v.name || 'Untitled', headline: v.headline || null, summary: v.summary || null, template: v.template, selection: v.selection } })
        .then(() => setStatus('saved'))
        .catch((e) => {
          setStatus('error');
          toast.error(errorMessage(e));
        });
    }, 900);
    return () => clearTimeout(t);
  }, [v]);

  const sel = v.selection;
  const setSel = (s: CvSelection) => setV({ ...v, selection: s });
  const kinds = ORDERED.filter((k) => profile.items.some((i) => i.kind === k));
  const sectionOrder = [...sel.sections.filter((k) => kinds.includes(k)), ...kinds.filter((k) => !sel.sections.includes(k))];
  const doc = useMemo(() => buildCvDocument(profile, v), [profile, v]);

  function toggleSection(k: ProfileKind, on: boolean) {
    setSel({ ...sel, sections: on ? [...sel.sections.filter((x) => kinds.includes(x)), k].sort((a, b) => sectionOrder.indexOf(a) - sectionOrder.indexOf(b)) : sel.sections.filter((x) => x !== k) });
  }
  function moveSection(k: ProfileKind, d: -1 | 1) {
    const order = [...sectionOrder];
    const i = order.indexOf(k);
    order.splice(i, 1);
    order.splice(i + d, 0, k);
    setSel({ ...sel, sections: order.filter((x) => sel.sections.includes(x)) });
  }
  function toggleItem(item: ProfileItemDto, on: boolean) {
    setSel({ ...sel, items: on ? [...sel.items, { id: item.id, bullets: item.bullets.map((b) => b.id) }] : sel.items.filter((x) => x.id !== item.id) });
  }
  function moveItem(kind: ProfileKind, id: string, d: -1 | 1) {
    const ofKind = sel.items.filter((x) => profile.items.find((p) => p.id === x.id)?.kind === kind);
    const i = ofKind.findIndex((x) => x.id === id);
    const j = i + d;
    if (j < 0 || j >= ofKind.length) return;
    const a = sel.items.indexOf(ofKind[i]!);
    const b = sel.items.indexOf(ofKind[j]!);
    const items = [...sel.items];
    [items[a], items[b]] = [items[b]!, items[a]!];
    setSel({ ...sel, items });
  }
  function toggleBullet(item: ProfileItemDto, bulletId: string, on: boolean) {
    setSel({
      ...sel,
      items: sel.items.map((x) => (x.id !== item.id ? x : { ...x, bullets: item.bullets.map((b) => b.id).filter((b) => (b === bulletId ? on : x.bullets.includes(b))) })),
    });
  }

  return (
    <>
      <PageHeader
        back={{ href: '/app/cv', label: 'CV builder' }}
        title={v.name || 'Untitled'}
        description={<span aria-live="polite">{status === 'saving' ? 'Saving…' : status === 'dirty' ? 'Unsaved changes' : status === 'error' ? 'Not saved' : 'All changes saved'}</span>}
        actions={
          <Button
            disabled={pdf.pending}
            onClick={async () => {
              await saving.current;
              await pdf.download(`/cv-versions/${v.id}/pdf`);
            }}
          >
            <Download className="size-4" aria-hidden /> {pdf.pending ? 'Making PDF…' : 'Download PDF'}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Section title="Version">
            <div className="space-y-4">
              <Field label="Name">{(p) => <Input {...p} value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Template</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {CV_TEMPLATES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={v.template === t}
                      onClick={() => setV({ ...v, template: t })}
                      className={cn('rounded-md border p-3 text-left transition-colors', v.template === t ? 'border-brand bg-brand-tint' : 'border-border hover:border-line-strong')}
                    >
                      <span className="flex items-center justify-between font-semibold">
                        {CV_TEMPLATE_LABELS[t]} {v.template === t ? <Check className="size-4 text-brand" aria-hidden /> : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{CV_TEMPLATE_NOTES[t]}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <Field label="Headline for this version" optional hint={profile.contact.headline ? `Leave empty to use “${profile.contact.headline}”.` : undefined}>
                {(p) => <Input {...p} value={v.headline ?? ''} onChange={(e) => setV({ ...v, headline: e.target.value })} />}
              </Field>
              <Field label="Summary for this version" optional hint="Leave empty to use the summary from your profile.">
                {(p) => <Textarea {...p} rows={4} value={v.summary ?? ''} onChange={(e) => setV({ ...v, summary: e.target.value })} />}
              </Field>
            </div>
          </Section>

          <Section title="What to include" description="Tick sections, items and bullets. Arrows change the order on the CV.">
            <div className="space-y-5">
              {sectionOrder.map((k, si) => {
                const on = sel.sections.includes(k);
                const items = profile.items.filter((i) => i.kind === k);
                const chosen = sel.items.filter((x) => items.some((i) => i.id === x.id));
                const ordered = [...chosen.map((c) => items.find((i) => i.id === c.id)!), ...items.filter((i) => !chosen.some((c) => c.id === i.id))];
                return (
                  <div key={k} className={cn('rounded-md border border-border', !on && 'bg-canvas/60')}>
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                      <label className="flex flex-1 items-center gap-2 font-semibold">
                        <Checkbox checked={on} onCheckedChange={(c) => toggleSection(k, c === true)} />
                        {PROFILE_KIND_LABELS[k]}
                      </label>
                      <Button size="icon" variant="ghost" className="size-7" aria-label={`Move ${PROFILE_KIND_LABELS[k]} up`} disabled={si === 0} onClick={() => moveSection(k, -1)}>
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-7" aria-label={`Move ${PROFILE_KIND_LABELS[k]} down`} disabled={si === sectionOrder.length - 1} onClick={() => moveSection(k, 1)}>
                        <ArrowDown className="size-3.5" />
                      </Button>
                    </div>
                    {on ? (
                      <ul className="divide-y divide-border">
                        {ordered.map((item) => {
                          const pick = sel.items.find((x) => x.id === item.id);
                          const ci = chosen.findIndex((c) => c.id === item.id);
                          return (
                            <li key={item.id} className="px-3 py-2">
                              <div className="flex items-start gap-2">
                                <label className="flex flex-1 items-start gap-2 text-sm">
                                  <Checkbox className="mt-0.5" checked={!!pick} onCheckedChange={(c) => toggleItem(item, c === true)} />
                                  <span className={cn('font-medium', !pick && 'text-muted-foreground')}>{itemTitle(item)}</span>
                                </label>
                                {pick ? (
                                  <>
                                    <Button size="icon" variant="ghost" className="size-7" aria-label="Move up" disabled={ci === 0} onClick={() => moveItem(k, item.id, -1)}>
                                      <ArrowUp className="size-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="size-7" aria-label="Move down" disabled={ci === chosen.length - 1} onClick={() => moveItem(k, item.id, 1)}>
                                      <ArrowDown className="size-3.5" />
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                              {pick && item.bullets.length ? (
                                <ul className="mt-1.5 space-y-1 pl-6">
                                  {item.bullets.map((b) => (
                                    <li key={b.id}>
                                      <label className="flex items-start gap-2 text-sm text-ink-soft">
                                        <Checkbox className="mt-0.5" checked={pick.bullets.includes(b.id)} onCheckedChange={(c) => toggleBullet(item, b.id, c === true)} />
                                        <span className={pick.bullets.includes(b.id) ? 'text-ink' : ''}>{b.text}</span>
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
              {!sectionOrder.length ? <p className="text-sm text-muted-foreground">Your profile is empty. Add jobs, projects and skills in the CV builder first.</p> : null}
            </div>
          </Section>
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <PdfPreview input={{ kind: 'cv', doc, template: v.template }} className="h-[75dvh] lg:h-[calc(100dvh-7rem)]" />
        </div>
      </div>
    </>
  );
}

export default function CvVersionPage() {
  const { versionId } = useParams<{ versionId: string }>();
  const profile = useApi<ProfileDto>('/profile');
  const version = useApi<CvVersionDto>(`/cv-versions/${versionId}`);
  if (profile.error || version.error) return <ErrorState error={profile.error ?? version.error} onRetry={() => void Promise.all([profile.reload(), version.reload()])} />;
  if (!profile.data || !version.data) return <ListSkeleton rows={8} />;
  return <Editor profile={profile.data} initial={version.data} />;
}
