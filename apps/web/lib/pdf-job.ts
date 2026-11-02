'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api, apiUrl, errorMessage } from './api';

interface DataJob {
  id: string;
  status: 'PENDING' | 'DONE' | 'FAILED';
  fileId: string | null;
  error: string | null;
}

/** Starts a PDF job on the server (rendered in the worker), waits for it, then downloads the file. */
export function usePdfDownload() {
  const [pending, setPending] = useState(false);
  async function download(path: string) {
    setPending(true);
    try {
      let job = await api<DataJob>(path, { method: 'POST' });
      const deadline = Date.now() + 60_000;
      while (job.status === 'PENDING' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 700));
        job = await api<DataJob>(`/data-jobs/${job.id}`);
      }
      if (job.status !== 'DONE' || !job.fileId) throw new Error(job.error ?? 'The PDF is taking longer than expected. Try again in a moment.');
      window.location.assign(apiUrl(`/files/${job.fileId}`));
    } catch (e) {
      toast.error(e instanceof Error && !('status' in e) ? e.message : errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return { download, pending };
}
