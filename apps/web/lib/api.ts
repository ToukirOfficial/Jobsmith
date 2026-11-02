/**
 * Browser API client. Every call goes to /api/v1 on this origin (Next.js forwards it to NestJS). Cookies
 * carry the session; on a 401 we refresh once and retry.
 * The web app never decides permissions: NestJS checks every request.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

function readCsrf(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith('js_csrf='))
    ?.slice('js_csrf='.length);
}

export async function csrfHeader(): Promise<Record<string, string>> {
  let token = readCsrf();
  if (!token) {
    await fetch('/api/v1/health', { credentials: 'same-origin' }).catch(() => undefined);
    token = readCsrf();
  }
  return token ? { 'X-CSRF-Token': decodeURIComponent(token) } : {};
}

let refreshing: Promise<boolean> | undefined;
function refresh(): Promise<boolean> {
  refreshing ??= csrfHeader()
    .then((headers) => fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin', headers }))
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = undefined;
    });
  return refreshing;
}

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const unsafe = !SAFE.has((rest.method ?? 'GET').toUpperCase());
  const init: RequestInit = {
    ...rest,
    credentials: 'same-origin',
    headers: {
      ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(unsafe ? await csrfHeader() : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  };
  const url = `/api/v1${path}`;
  let res = await fetch(url, init);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refresh()) res = await fetch(url, init);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const b = (data ?? {}) as { message?: string; code?: string; field?: string; fields?: Record<string, string> };
    const message = b.message ?? 'Something went wrong. Please try again.';
    throw new ApiError(res.status, message, b.code, b.fields ?? (b.field ? { [b.field]: message } : undefined));
  }
  return data as T;
}

/** A download link that goes through the API's permission checks (never a direct file URL). */
export const apiUrl = (path: string) => `/api/v1${path}`;

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Check your connection and try again.';
}
