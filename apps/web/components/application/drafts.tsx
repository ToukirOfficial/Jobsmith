'use client';

import { useEffect, useState } from 'react';
import { Copy, Download, FileInput } from 'lucide-react';
import { toast } from 'sonner';
import { DRAFT_KINDS, DRAFT_KIND_LABELS, type DraftDto, type DraftKind, type LetterTemplateDto } from '@jobsmith/shared';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { usePdfDownload } from '@/lib/pdf-job';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const HINTS: Record<DraftKind, string> = {
  COVER_LETTER: 'Plain and specific. Short sentences. Only things that are true.',
  LINKEDIN_NOTE: 'Under 300 characters fits a LinkedIn connection note.',
  FOLLOW_UP_EMAIL: 'A short, polite nudge a week or so after applying.',
};

/** Cover letter, LinkedIn note and follow-up email for one application. Nothing is ever sent from here. */
export function DraftsSection({ applicationId, refreshKey }: { applicationId: string; refreshKey?: number }) {
  const drafts = useApi<DraftDto[]>(`/applications/${applicationId}/drafts`);
  const templates = useApi<LetterTemplateDto[]>('/letter-templates');
  const [kind, setKind] = useState<DraftKind>('COVER_LETTER');
  const [bodies, setBodies] = useState<Partial<Record<DraftKind, string>>>({});
  const [saving, setSaving] = useState(false);
  const pdf = usePdfDownload();
  const current = drafts.data?.find((d) => d.kind === kind);
  const body = bodies[kind] ?? current?.body ?? '';
  const dirty = body !== (current?.body ?? '');

  useEffect(() => {
    if (refreshKey) {
      setBodies({});
      void drafts.reload();
    }
  }, [refreshKey]);

  async function save(): Promise<DraftDto | undefined> {
    setSaving(true);
    try {
      const d = await api<DraftDto>(`/applications/${applicationId}/drafts/${kind}`, { method: 'PUT', body: { body } });
      drafts.setData([...(drafts.data ?? []).filter((x) => x.kind !== kind), d]);
      setBodies((b) => ({ ...b, [kind]: undefined }));
      toast.success(`${DRAFT_KIND_LABELS[kind]} saved`);
      return d;
    } catch (e) {
      toast.error(errorMessage(e));
      return undefined;
    } finally {
      setSaving(false);
    }
  }

  async function useTemplate(id: string) {
    if (!id) return;
    if (body.trim() && !window.confirm('Replace the current text with this template?')) return;
    try {
      const d = await api<DraftDto>(`/applications/${applicationId}/drafts/${kind}/from-template`, { method: 'POST', body: { templateId: id } });
      drafts.setData([...(drafts.data ?? []).filter((x) => x.kind !== kind), d]);
      setBodies((b) => ({ ...b, [kind]: undefined }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Section title="Cover letter and messages" description="Drafts stay here until you copy or download them. Jobsmith never sends anything for you." flush>
      <div role="tablist" aria-label="Draft type" className="flex gap-1 overflow-x-auto border-b border-border px-3 pt-2">
        {DRAFT_KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap', kind === k ? 'border-brand text-brand' : 'border-transparent text-ink-soft hover:text-ink')}
          >
            {DRAFT_KIND_LABELS[k]}
            {drafts.data?.some((d) => d.kind === k && d.body.trim()) ? <span className="ml-1.5 inline-block size-1.5 rounded-full bg-ok align-middle" aria-label="has a draft" /> : null}
          </button>
        ))}
      </div>
      <div className="space-y-3 p-4">
        <Textarea
          value={body}
          onChange={(e) => setBodies((b) => ({ ...b, [kind]: e.target.value }))}
          rows={kind === 'COVER_LETTER' ? 14 : 6}
          aria-label={DRAFT_KIND_LABELS[kind]}
          placeholder={kind === 'COVER_LETTER' ? 'Start from a template, or let the agent draft one.' : 'Write a short message.'}
        />
        <p className="flex justify-between text-xs text-muted-foreground">
          <span>{HINTS[kind]}</span>
          <span className="tabular-nums">{body.length} characters</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {templates.data?.length ? (
            <NativeSelect value="" onChange={(e) => void useTemplate(e.target.value)} aria-label="Start from a template" className="w-auto">
              <option value="">Start from a template…</option>
              {templates.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!body.trim()}
              onClick={async () => {
                await navigator.clipboard.writeText(body);
                toast.success('Copied');
              }}
            >
              <Copy className="size-4" aria-hidden /> Copy
            </Button>
            {kind === 'COVER_LETTER' ? (
              <Button
                variant="outline"
                size="sm"
                disabled={!body.trim() || pdf.pending}
                onClick={async () => {
                  const d = dirty ? await save() : current;
                  if (d) await pdf.download(`/drafts/${d.id}/pdf`);
                }}
              >
                <Download className="size-4" aria-hidden /> {pdf.pending ? 'Making PDF…' : 'PDF'}
              </Button>
            ) : null}
            <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
              <FileInput className="size-4" aria-hidden /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
