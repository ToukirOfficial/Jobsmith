'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Me } from '@jobsmith/shared';
import { api, ApiError } from './api';

interface Session {
  me: Me;
  tz: string;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

/** Loads who is logged in and sends people to /login when they aren't. Display only: the API checks every request. */
export function SessionProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  const load = useCallback(async () => {
    try {
      setMe(await api<Me>('/me'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/app';
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      } else throw e;
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<Session | null>(() => {
    if (!me) return null;
    return {
      me,
      tz: me.settings.timeZone,
      reload: load,
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        window.location.assign('/login');
      },
    };
  }, [me, load]);

  if (!value) return <>{fallback}</>;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
