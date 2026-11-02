'use client';

import { useState } from 'react';
import type { z } from 'zod';
import { api, ApiError, errorMessage, type ApiOptions } from './api';

/**
 * Plain forms with the shared Zod schemas: validate in the browser for quick feedback, then let the API
 * validate again (it always does). Field errors from either side land in `errors`.
 */
export function useForm<S extends z.ZodType>(schema: S) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit<T>(values: unknown, path: string, options: Omit<ApiOptions, 'body'> = {}): Promise<T | undefined> {
    setFormError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join('.') || '_'] ??= issue.message;
      setErrors(next);
      return undefined;
    }
    setErrors({});
    setPending(true);
    try {
      return await api<T>(path, { method: 'POST', ...options, body: parsed.data });
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      setFormError(errorMessage(e));
      return undefined;
    } finally {
      setPending(false);
    }
  }

  return { errors, formError, pending, submit, setErrors, setFormError };
}
