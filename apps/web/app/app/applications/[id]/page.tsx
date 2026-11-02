'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, ExternalLink, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CHANNELS,
  CHANNEL_LABELS,
  STAGES,
  STAGE_LABELS,
  WORK_MODE_LABELS,
  applicationSchema,
  formatDate,
  formatDateTime,
  type ApplicationDetail,
  type Channel,
  type Stage,
} from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { ContactsSection } from '@/components/application/contacts';
import { InterviewsSection } from '@/components/application/interviews';
import { SentSection } from '@/components/application/sent';
import { DraftsSection } from '@/components/application/drafts';
import { InsightsSection } from '@/components/application/insights';
import { Confirm } from '@/components/confirm';
import { FormDialog } from '@/components/form-dialog';
import { DaysInStage, STAGE_STYLE, Salary, SponsorBadge, StageBadge } from '@/components/job-bits';
import { JobForm, fromPence, toBody, type JobValues } from '@/components/job-form';
import { Section } from '@/components/section';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { useForm } from '@/lib/form';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Notes({ app, onSaved }: { app: ApplicationDetail; onSaved: (a: ApplicationDetail) => void }) {
  const [notes, setNotes] = useState(app.notes ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setNotes(app.notes ?? ''), [app.notes]);
  const dirty = notes !== (app.notes ?? '');
  return (
    <Section title="Notes" description="Private notes: why it’s a fit, who referred you, salary thoughts.">
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} aria-label="Notes" />
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            try {
              onSaved(await api<ApplicationDetail>(`/applications/${app.id}`, { method: 'PATCH', body: { notes: notes || null } }));
              toast.success('Notes saved');
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save notes'}
        </Button>
      </div>
    </Section>
  );
}

function Description({ text }: { text: string | null }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 900;
  return (
    <Section title="Job description">
      <div className={cn('relative text-sm leading-relaxed whitespace-pre-line', long && !open && 'max-h-72 overflow-hidden')}>
        {text}
        {long && !open ? <div aria-hidden className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-paper to-transparent" /> : null}
      </div>
      {long ? (
        <Button variant="link" className="mt-1 h-auto px-0" onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show the full description'}
        </Button>
      ) : null}
    </Section>
  );
}

function Timeline({ app }: { app: ApplicationDetail }) {
  const { tz } = useSession();
  return (
    <Section title="Timeline">
      <ol className="relative space-y-4 border-l border-line pl-5">
        {[...app.timeline].reverse().map((t, i) => (
          <li key={i} className="relative">
            <span aria-hidden className={cn('absolute top-1.5 -left-[1.5rem] size-2.5 rounded-full border-2 border-paper', t.kind === 'stage' ? 'bg-brand' : t.kind === 'snapshot' ? 'bg-ok' : t.kind === 'agent' ? 'bg-spark' : 'bg-line-strong')} />
            <p className="text-sm">{t.text}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(t.at, tz)}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { tz } = useSession();
  const { data: app, error, loading, reload, setData } = useApi<ApplicationDetail>(`/applications/${id}`);
  const [editing, setEditing] = useState(false);
  const form = useForm(applicationSchema);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !app) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (!app) return null;

  async function setStage(stage: Stage) {
    try {
      await api(`/applications/${app!.id}/stage`, { method: 'POST', body: { stage } });
      toast.success(`Moved to ${STAGE_LABELS[stage]}`);
      void reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function setChannel(channel: Channel | '') {
    try {
      setData(await api<ApplicationDetail>(`/applications/${app!.id}`, { method: 'PATCH', body: { channel: channel || null } }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const initial: JobValues = {
    title: app.title,
    company: app.company.name,
    url: app.url ?? '',
    location: app.location ?? '',
    workMode: app.workMode ?? '',
    salaryMin: fromPence(app.salaryMinPence),
    salaryMax: fromPence(app.salaryMaxPence),
    currency: app.currency,
    closingDate: app.closingDate ?? '',
    description: app.description ?? '',
  };

  return (
    <>
      <PageHeader
        back={{ href: '/app/board', label: 'Board' }}
        title={app.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/app/companies/${app.company.id}`} className="font-semibold text-ink hover:text-brand">
              {app.company.name}
            </Link>
            <SponsorBadge sponsor={app.sponsor} />
            {app.archivedAt ? <span className="rounded-full bg-none-tint px-2 py-0.5 text-xs font-semibold text-none">Archived</span> : null}
          </span>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={async () => {
                    setData(await api<ApplicationDetail>(`/applications/${app.id}/archive`, { method: 'POST', body: { archived: !app.archivedAt } }));
                    toast.success(app.archivedAt ? 'Restored' : 'Archived');
                  }}
                >
                  {app.archivedAt ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
                  {app.archivedAt ? 'Restore from archive' : 'Archive'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <InsightsSection applicationId={app.id} refreshKey={app.updatedAt} />
          <DraftsSection applicationId={app.id} />
          <InterviewsSection applicationId={app.id} interviews={app.interviews} onChange={() => void reload()} />
          <ContactsSection applicationId={app.id} companyId={app.company.id} contacts={app.contacts} onChange={() => void reload()} />
          <Notes app={app} onSaved={setData} />
          <Description text={app.description} />
        </div>

        <aside className="space-y-6">
          <section className={cn('rounded-lg border border-border border-t-[3px] bg-paper p-4', STAGE_STYLE[app.stage].top)}>
            <div className="mb-3 flex items-center justify-between">
              <StageBadge stage={app.stage} />
              <DaysInStage since={app.stageChangedAt} tz={tz} stage={app.stage} />
            </div>
            <label className="text-sm font-medium" htmlFor="stage">
              Stage
            </label>
            <NativeSelect id="stage" value={app.stage} onChange={(e) => void setStage(e.target.value as Stage)} className="mt-1.5">
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
            <label className="mt-3 block text-sm font-medium" htmlFor="channel">
              Applied through
            </label>
            <NativeSelect id="channel" value={app.channel ?? ''} onChange={(e) => void setChannel(e.target.value as Channel | '')} className="mt-1.5">
              <option value="">Not recorded</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
            {app.nextReminder ? (
              <p className="mt-3 rounded-md bg-brand-tint px-3 py-2 text-sm text-brand">
                Next reminder {formatDate(app.nextReminder.dueAt, tz)}: {app.nextReminder.title}
              </p>
            ) : null}
          </section>

          <SentSection app={app} onChange={(a) => {
            setData(a);
            // Snapshot PDFs are made in the background; check again shortly.
            setTimeout(() => void reload(), 2500);
          }} />

          <Section title="Details">
            <dl>
              <Detail label="Location">{app.location}</Detail>
              <Detail label="Work mode">{app.workMode ? WORK_MODE_LABELS[app.workMode] : null}</Detail>
              <Detail label="Salary">{app.salaryMinPence || app.salaryMaxPence ? <Salary min={app.salaryMinPence} max={app.salaryMaxPence} currency={app.currency} /> : null}</Detail>
              <Detail label="Closes">{app.closingDate ? formatDate(app.closingDate, 'UTC') : null}</Detail>
              <Detail label="Applied">{app.appliedAt ? formatDate(app.appliedAt, tz) : null}</Detail>
              <Detail label="Saved">{formatDate(app.createdAt, tz)}</Detail>
              <Detail label="Job page">
                {app.url ? (
                  <a href={app.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                    Open <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </Detail>
            </dl>
          </Section>

          <Timeline app={app} />

          <Confirm
            title="Delete this application?"
            description="Its interviews, notes, drafts and anything sent with it are deleted for good. Archive it instead to keep the history."
            confirmLabel="Delete"
            destructive
            onConfirm={async () => {
              await api(`/applications/${app.id}`, { method: 'DELETE' });
              toast.success('Application deleted');
              router.push('/app/applications');
            }}
          >
            <Button variant="ghost" className="w-full text-bad hover:bg-bad-tint hover:text-bad">
              <Trash2 className="size-4" aria-hidden /> Delete application
            </Button>
          </Confirm>
        </aside>
      </div>

      <FormDialog title="Edit job" open={editing} onOpenChange={setEditing} wide>
        <JobForm
          initial={initial}
          submitLabel="Save changes"
          excludeId={app.id}
          pending={form.pending}
          formError={form.formError}
          errors={form.errors}
          onSubmit={async (v) => {
            const saved = await form.submit<ApplicationDetail>({ ...toBody(v), stage: app.stage }, `/applications/${app.id}`, { method: 'PATCH' });
            if (saved) {
              setData(saved);
              setEditing(false);
              toast.success('Job updated');
            }
          }}
        />
      </FormDialog>
    </>
  );
}
