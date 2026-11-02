'use client';

import { useState } from 'react';
import { CheckCircle2, Download, FileText, Send } from 'lucide-react';
import { toast } from 'sonner';
import { CHANNELS, CHANNEL_LABELS, applySchema, dateKey, formatDate, type ApplicationDetail, type Channel, type CvVersionDto, type SnapshotRef } from '@jobsmith/shared';
import { Field } from '@/components/field';
import { FormDialog } from '@/components/form-dialog';
import { FormError } from '@/components/form-error';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { apiUrl } from '@/lib/api';
import { useForm } from '@/lib/form';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

function ApplyForm({ app, onDone }: { app: ApplicationDetail; onDone: (a: ApplicationDetail) => void }) {
  const { tz } = useSession();
  const versions = useApi<CvVersionDto[]>('/cv-versions');
  const [channel, setChannel] = useState<Channel>(app.channel ?? 'COMPANY_SITE');
  const [appliedOn, setAppliedOn] = useState(dateKey(new Date(), tz));
  const [cvVersionId, setCv] = useState('');
  const [letter, setLetter] = useState(true);
  const form = useForm(applySchema);
  const chosen = cvVersionId || versions.data?.[0]?.id || '';
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const saved = await form.submit<ApplicationDetail>({ channel, appliedOn, cvVersionId: chosen || null, attachCoverLetter: letter }, `/applications/${app.id}/apply`);
        if (saved) {
          toast.success('Marked as applied. What you sent is saved.');
          onDone(saved);
        }
      }}
    >
      <FormError message={form.formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Applied through">
          {(p) => (
            <NativeSelect {...p} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Date applied">{(p) => <Input {...p} type="date" value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} />}</Field>
      </div>
      <Field label="CV version you sent" hint="A copy is frozen with this application: later edits never change it.">
        {(p) => (
          <NativeSelect {...p} value={chosen} onChange={(e) => setCv(e.target.value)}>
            <option value="">No CV (or not from Jobsmith)</option>
            {(versions.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox className="mt-0.5" checked={letter} onCheckedChange={(c) => setLetter(c === true)} />
        <span>Save this application’s cover letter draft with it (if there is one)</span>
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={form.pending}>
          <Send className="size-4" aria-hidden /> {form.pending ? 'Saving…' : 'Mark as applied'}
        </Button>
      </div>
    </form>
  );
}

function SnapshotRow({ s }: { s: SnapshotRef }) {
  const { tz } = useSession();
  return (
    <li className="flex items-center gap-3 py-2">
      <FileText className="size-5 shrink-0 text-ink-soft" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{s.label}</span>
        <span className="block text-xs text-muted-foreground">Frozen {formatDate(s.createdAt, tz)}</span>
      </span>
      {s.fileId ? (
        <Button asChild size="sm" variant="outline">
          <a href={apiUrl(`/files/${s.fileId}`)}>
            <Download className="size-4" aria-hidden /> PDF
          </a>
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">Making PDF…</span>
      )}
    </li>
  );
}

export function SentSection({ app, onChange }: { app: ApplicationDetail; onChange: (a: ApplicationDetail) => void }) {
  const [open, setOpen] = useState(false);
  const sent = app.cvSnapshot || app.letterSnapshot;
  return (
    <Section title="What you sent">
      {sent ? (
        <>
          <p className="mb-1 flex items-center gap-1.5 text-sm text-ok">
            <CheckCircle2 className="size-4" aria-hidden /> Kept exactly as sent
          </p>
          <ul className="divide-y divide-border">
            {app.cvSnapshot ? <SnapshotRow s={app.cvSnapshot} /> : null}
            {app.letterSnapshot ? <SnapshotRow s={app.letterSnapshot} /> : null}
          </ul>
        </>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">When you apply, record the channel and the CV version. Jobsmith keeps a frozen copy of exactly what went out.</p>
          <FormDialog
            title="Mark as applied"
            description={`${app.title} at ${app.company.name}`}
            open={open}
            onOpenChange={setOpen}
            trigger={
              <Button className="w-full">
                <Send className="size-4" aria-hidden /> Mark as applied
              </Button>
            }
          >
            <ApplyForm
              app={app}
              onDone={(a) => {
                setOpen(false);
                onChange(a);
              }}
            />
          </FormDialog>
        </div>
      )}
    </Section>
  );
}
