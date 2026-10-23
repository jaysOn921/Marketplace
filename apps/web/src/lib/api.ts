import { API_PREFIX, type ApiError, type CsrfResponse } from '@tzed/shared';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Per-field messages from a validation error, e.g. { email: '…' }. */
  get fields(): Record<string, string> {
    const fields = (this.details as { fields?: Record<string, string> } | undefined)?.fields;
    return fields ?? {};
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);
let csrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (!csrfToken) {
    const res = await fetch(`${API_PREFIX}/auth/csrf`, { credentials: 'include' });
    csrfToken = ((await res.json()) as CsrfResponse).csrfToken;
  }
  return csrfToken;
}

/** Forget the token (e.g. after sign-out, when the session ends). */
export function clearCsrfToken() {
  csrfToken = null;
}

/**
 * Small fetch wrapper: JSON in/out, cookies included, CSRF token on every write,
 * API errors thrown as ApiRequestError.
 */
export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (!SAFE_METHODS.has(method)) {
    headers.set('X-CSRF-Token', await getCsrfToken());
  }

  const res = await fetch(`${API_PREFIX}${path}`, { ...init, headers, credentials: 'include' });
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    // The session (and its token) may have expired: get a fresh token and retry once.
    if (err?.code === 'CSRF_INVALID' && !retried) {
      clearCsrfToken();
      return api<T>(path, init, true);
    }
    throw new ApiRequestError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }

  // Signing in starts a new session with a new token.
  const token = (data as { csrfToken?: unknown } | null)?.csrfToken;
  if (typeof token === 'string') csrfToken = token;
  return data as T;
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const del = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) });
