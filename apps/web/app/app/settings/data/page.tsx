'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Download, FileUp, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { IMPORT_FIELDS, type ImportField } from '@jobsmith/shared';
import { FormError } from '@/components/form-error';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, apiUrl, errorMessage } from '@/lib/api';

interface Job {
  id: string;
  status: 'PENDING' | 'DONE' | 'FAILED';
  fileId: string | null;
  error: string | null;
  result: { created?: number; skipped?: number; errors?: { row: number; reason: string }[] } | null;
}
interface Preview {
  headers: string[];
  sample: string[][];
  rowCount: number;
  tooMany: boolean;
  mapping: Record<ImportField, number | null>;
}

const FIELD_LABELS: Record<ImportField, string> = {
  title: 'Job title',
  company: 'Company',
  location: 'Location',
  url: 'Job link',
  stage: 'Stage',
  appliedOn: 'Date applied',
  closingDate: 'Closing date',
  salaryMin: 'Salary (from)',
  salaryMax: 'Salary (to)',
  channel: 'Applied through',
  notes: 'Notes',
};

async function waitFor(id: string): Promise<Job> {
  let job = await api<Job>(`/data-jobs/${id}`);
  const deadline = Date.now() + 120_000;
  while (job.status === 'PENDING' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 900));
    job = await api<Job>(`/data-jobs/${id}`);
  }
  return job;
}

function Export() {
  const [pending, setPending] = useState(false);
  return (
    <Section title="Export everything" description="Your applications, CV profile and versions, letters, contacts, interviews and reminders as JSON and CSV, plus every PDF you sent, in one zip.">
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            const job = await waitFor((await api<Job>('/exports', { method: 'POST' })).id);
            if (job.status !== 'DONE' || !job.fileId) throw new Error(job.error ?? 'The export is taking a while. Try again in a minute.');
            window.location.assign(apiUrl(`/files/${job.fileId}`));
            toast.success('Export ready. The download link works for 24 hours.');
          } catch (e) {
            toast.error(e instanceof Error && !('status' in e) ? e.message : errorMessage(e));
          } finally {
            setPending(false);
          }
        }}
      >
        <Download className="size-4" aria-hidden /> {pending ? 'Preparing your export…' : 'Download my data'}
      </Button>
    </Section>
  );
}

function Import() {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<ImportField, number | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Job['result']>(null);

  async function choose(file: File) {
    setError(null);
    setResult(null);
    if (file.size > 3_000_000) return setError('That file is too large (3 MB at most).');
    const text = await file.text();
    try {
      const p = await api<Preview>('/imports/preview', { method: 'POST', body: { csv: text } });
      setCsv(text);
      setFileName(file.name);
      setPreview(p);
      setMapping(p.mapping);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function run() {
    if (!csv || !mapping) return;
    setPending(true);
    setError(null);
    try {
      const job = await waitFor((await api<Job>('/imports', { method: 'POST', body: { csv, mapping } })).id);
      if (job.status !== 'DONE') throw new Error(job.error ?? 'The import is still running. Check your applications in a minute.');
      setResult(job.result);
      setPreview(null);
      setCsv(null);
    } catch (e) {
      setError(e instanceof Error && !('status' in e) ? e.message : errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Section title="Import from a spreadsheet" description="Bring in an old job-tracking spreadsheet. Save it as CSV first. Up to 2,000 rows.">
      <div className="space-y-4">
        <FormError message={error} />
        {result ? (
          <div className="rounded-md bg-ok-tint px-4 py-3 text-sm text-ok">
            <p className="font-semibold">
              Imported {result.created} {result.created === 1 ? 'job' : 'jobs'}
              {result.skipped ? `, skipped ${result.skipped}` : ''}.
            </p>
            {result.errors?.length ? <p className="mt-1">Skipped rows: {result.errors.map((e) => `${e.row} (${e.reason.toLowerCase()})`).join(', ')}.</p> : null}
            <Link href="/app/applications" className="mt-1 inline-block font-semibold underline">
              See your applications
            </Link>
          </div>
        ) : null}
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-strong px-4 py-6 text-sm font-medium text-ink-soft hover:border-brand hover:text-brand">
          <FileUp className="size-5" aria-hidden />
          {fileName ? `Chosen: ${fileName}. Choose another` : 'Choose a CSV file'}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && void choose(e.target.files[0])} />
        </label>
        {preview && mapping ? (
          <>
            <p className="text-sm">
              {preview.rowCount} rows found{preview.tooMany ? ' (only the first 2,000 will be imported)' : ''}. Match your columns to Jobsmith’s fields. Unknown stages become Saved; UK dates like 02/11/2026 are read as 2 November.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {IMPORT_FIELDS.map((f) => (
                <label key={f} className="space-y-1 text-sm">
                  <span className="font-medium">
                    {FIELD_LABELS[f]}
                    {f === 'title' || f === 'company' ? '' : <span className="font-normal text-muted-foreground"> (optional)</span>}
                  </span>
                  <NativeSelect value={mapping[f] ?? ''} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">Don’t import</option>
                    {preview.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ))}
            </div>
            <div className="rounded-lg border border-border">
              <Table stack={false}>
                <TableHeader>
                  <TableRow>
                    {preview.headers.map((h, i) => (
                      <TableHead key={i} className="whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.sample.map((r, i) => (
                    <TableRow key={i}>
                      {preview.headers.map((_, j) => (
                        <TableCell key={j} className="max-w-48 truncate">
                          {r[j]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end">
              <Button disabled={pending || mapping.title == null || mapping.company == null} onClick={() => void run()}>
                <Upload className="size-4" aria-hidden /> {pending ? 'Importing…' : `Import ${preview.rowCount} rows`}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Section>
  );
}

export default function DataPage() {
  return (
    <div className="space-y-6">
      <Export />
      <Import />
      <p className="text-sm text-muted-foreground">
        To delete your account and everything in it, go to{' '}
        <Link href="/app/settings/account" className="font-semibold text-brand hover:underline">
          Account
        </Link>
        .
      </p>
    </div>
  );
}
