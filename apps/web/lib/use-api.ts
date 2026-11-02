'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

/** Loads an API path and keeps loading, error and data state. `reload()` fetches again. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | Error | undefined>(undefined);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const result = await api<T>(path);
      if (n === seq.current) {
        setData(result);
        setError(undefined);
      }
    } catch (e) {
      if (n === seq.current) setError(e as Error);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}
