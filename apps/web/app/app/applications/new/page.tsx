'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ClipboardPaste, FileCheck2, Link2, PenLine, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { applicationSchema, type ApplicationDetail, type JobDraft, type JobFetchDto, type JobSource } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { Field } from '@/components/field';
import { FormError } from '@/components/form-error';
import { JobForm, emptyJob, fromPence, toBody, type JobValues } from '@/components/job-form';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage, ApiError } from '@/lib/api';
import { useForm } from '@/lib/form';
import { cn } from '@/lib/utils';

type Mode = 'link' | 'paste' | 'manual';
const NO_FETCH = /(^|\.)(linkedin\.com|lnkd\.in)$|(^|\.)indeed\.[a-z.]+$/i;

function draftToValues(d: JobDraft): JobValues {
  return {
    ...emptyJob,
    title: d.title ?? '',
    company: d.company ?? '',
    url: d.url ?? '',
    location: d.location ?? '',
    workMode: d.workMode ?? '',
    salaryMin: fromPence(d.salaryMinPence),
    salaryMax: fromPence(d.salaryMaxPence),
    currency: d.currency && ['GBP', 'EUR', 'USD'].includes(d.currency) ? d.currency : 'GBP',
    closingDate: d.closingDate ?? '',
    description: d.description ?? '',
  };
}

/** Pasted text: the description is the text; the first short line is probably the job title. */
function pastedDraft(text: string, url: string | null): JobDraft {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = lines.find((l) => l.length <= 90) ?? null;
  return { title, company: null, location: null, workMode: null, salaryMinPence: null, salaryMaxPence: null, currency: null, closingDate: null, description: text.trim(), url, method: 'PASTED' };
}

function isNoFetch(url: string) {
  try {
    return NO_FETCH.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

const NOTES: Record<JobDraft['method'], { icon: typeof FileCheck2; tone: string; text: string }> = {
  JSON_LD: { icon: FileCheck2, tone: 'bg-ok-tint text-ok', text: 'Filled in from the job’s structured data. Check everything before you save.' },
  AI: { icon: FileCheck2, tone: 'bg-info-tint text-info', text: 'Filled in by AI from the page. Check everything before you save: it can make mistakes.' },
  PAGE_TEXT: { icon: TriangleAlert, tone: 'bg-warn-tint text-warn', text: 'This page has no structured job data, so we copied its text into the description. Fill in the other fields from it.' },
  PASTED: { icon: ClipboardPaste, tone: 'bg-info-tint text-info', text: 'Your pasted text is in the description. Fill in the company and anything else from it.' },
};

function NewJob() {
  const router = useRouter();
  const params = useSearchParams();
  const fromBookmarklet = params.has('bm');
  const [mode, setMode] = useState<Mode>(params.get('text') ? 'paste' : 'link');
  const [url, setUrl] = useState(params.get('url') ?? '');
  const [text, setText] = useState(params.get('text') ?? '');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [initial, setInitial] = useState<JobValues>(emptyJob);
  const form = useForm(applicationSchema);
  const started = useRef(false);

  async function fetchLink(link: string) {
    setFetchError(null);
    if (isNoFetch(link)) {
      setMode('paste');
      setFetchError('LinkedIn and Indeed don’t allow automatic fetching. Copy the job text from the page and paste it here.');
      return;
    }
    setFetching(true);
    try {
      let job = await api<JobFetchDto>('/job-fetch', { method: 'POST', body: { url: link } });
      const deadline = Date.now() + 30_000;
      while (job.status === 'PENDING' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 800));
        job = await api<JobFetchDto>(`/job-fetch/${job.id}`);
      }
      if (job.status === 'DONE' && job.draft) {
        setDraft(job.draft);
        setInitial(draftToValues(job.draft));
      } else {
        setFetchError(job.error ?? 'That page is taking too long. Paste the job text instead.');
      }
    } catch (e) {
      setFetchError(errorMessage(e));
      if (e instanceof ApiError && e.code === 'BLOCKED_SITE') setMode('paste');
    } finally {
      setFetching(false);
    }
  }

  // The bookmarklet opens this page with the link: fetch it straight away (or switch to paste for LinkedIn/Indeed).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const link = params.get('url');
    const pasted = params.get('text');
    if (pasted) {
      const d = pastedDraft(pasted, link);
      setDraft(d);
      setInitial(draftToValues(d));
    } else if (link) void fetchLink(link);
  }, []);

  const source: JobSource = fromBookmarklet ? 'BOOKMARKLET' : draft?.method === 'PASTED' ? 'PASTE' : draft ? 'LINK' : 'MANUAL';
  const showForm = mode === 'manual' || !!draft;
  const note = draft ? NOTES[draft.method] : null;

  const tabs: { id: Mode; label: string; icon: typeof Link2 }[] = [
    { id: 'link', label: 'Paste a link', icon: Link2 },
    { id: 'paste', label: 'Paste the text', icon: ClipboardPaste },
    { id: 'manual', label: 'Type it in', icon: PenLine },
  ];

  return (
    <>
      <PageHeader title="Save a job" description="It goes into Saved on your board. You review every field before it’s saved." back={{ href: '/app/board', label: 'Board' }} />
      <div className="mx-auto max-w-3xl space-y-5">
        <div role="tablist" aria-label="How to add the job" className="grid grid-cols-3 gap-1 rounded-lg bg-canvas-deep p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={mode === t.id}
              onClick={() => {
                setMode(t.id);
                setFetchError(null);
                if (t.id === 'manual' && !draft) setInitial({ ...emptyJob, url });
              }}
              className={cn('flex items-center justify-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-ink-soft transition-colors', mode === t.id ? 'bg-paper text-ink shadow-sm' : 'hover:text-ink')}
            >
              <t.icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>

        {mode === 'link' && !draft ? (
          <Section>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (url.trim()) void fetchLink(url.trim());
              }}
            >
              <Field label="Job link" hint="Most company career sites work. LinkedIn and Indeed need the text pasted instead.">
                {(p) => (
                  <div className="flex gap-2">
                    <Input {...p} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://careers.example.com/jobs/123" autoFocus disabled={fetching} />
                    <Button type="submit" disabled={fetching || !url.trim()}>
                      {fetching ? 'Reading…' : 'Read page'}
                    </Button>
                  </div>
                )}
              </Field>
              <FormError message={fetchError} />
              {fetching ? (
                <div className="space-y-2 pt-2" aria-busy="true" aria-label="Reading the job page">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-2/3" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : null}
            </form>
          </Section>
        ) : null}

        {mode === 'paste' && !draft ? (
          <Section>
            <div className="space-y-3">
              <FormError message={fetchError} />
              <Field label="Job text" hint="Select everything in the job advert, copy, and paste it here.">
                {(p) => <Textarea {...p} rows={12} value={text} onChange={(e) => setText(e.target.value)} autoFocus />}
              </Field>
              <Field label="Job link" optional>
                {(p) => <Input {...p} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}
              </Field>
              <div className="flex justify-end">
                <Button
                  disabled={text.trim().length < 20}
                  onClick={() => {
                    const d = pastedDraft(text, url.trim() || null);
                    setDraft(d);
                    setInitial(draftToValues(d));
                  }}
                >
                  Use this text
                </Button>
              </div>
            </div>
          </Section>
        ) : null}

        {showForm ? (
          <Section
            title={draft ? 'Check the details' : undefined}
            actions={
              draft ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(null);
                    setInitial(emptyJob);
                  }}
                >
                  Start again
                </Button>
              ) : undefined
            }
          >
            {note ? (
              <p className={cn('mb-5 flex gap-2 rounded-md px-3 py-2 text-sm', note.tone)}>
                <note.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {note.text}
              </p>
            ) : null}
            <JobForm
              key={JSON.stringify(initial)}
              initial={initial}
              submitLabel="Save job"
              pending={form.pending}
              formError={form.formError}
              errors={form.errors}
              onSubmit={async (v) => {
                const saved = await form.submit<ApplicationDetail>({ ...toBody(v), source }, '/applications');
                if (saved) {
                  toast.success('Job saved');
                  router.push(`/app/applications/${saved.id}`);
                }
              }}
            />
          </Section>
        ) : null}
      </div>
    </>
  );
}

export default function NewApplicationPage() {
  return (
    <Suspense>
      <NewJob />
    </Suspense>
  );
}
