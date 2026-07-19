'use client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const TOKENS_KEY = 'pharmasaas.tokens';

export function getTokens(): Tokens | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
}

export function setTokens(tokens: Tokens | null): void {
  if (typeof window === 'undefined') return;
  if (tokens) {
    window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } else {
    window.localStorage.removeItem(TOKENS_KEY);
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const tokens = getTokens();
      if (!tokens) return false;
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (!response.ok) {
          setTokens(null);
          return false;
        }
        const next = (await response.json()) as Tokens;
        setTokens(next);
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
}

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const query = options.query
    ? '?' +
      Object.entries(options.query)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
        )
        .join('&')
    : '';

  const execute = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (!options.formData) {
      headers['Content-Type'] = 'application/json';
    }
    if (!options.skipAuth) {
      const tokens = getTokens();
      if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
    return fetch(`${API_URL}${path}${query}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.formData
        ? options.formData
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
    });
  };

  let response = await execute();
  if (response.status === 401 && !options.skipAuth) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      response = await execute();
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pharmasaas:logout'));
    }
  }

  if (!response.ok) {
    let body: unknown;
    let message = `Request failed (${response.status})`;
    try {
      body = await response.json();
      const raw = (body as { message?: string | string[] }).message;
      message = Array.isArray(raw) ? raw.join(', ') : (raw ?? message);
    } catch {
      // non-JSON error body
    }
    throw new ApiError(response.status, message, body);
  }

  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return (await response.blob()) as T;
  }
  return (await response.json()) as T;
}

/** Downloads a file endpoint (PDF / Excel) with authentication. */
export async function downloadFile(
  path: string,
  filename: string,
  query?: RequestOptions['query'],
): Promise<void> {
  const blob = await api<Blob>(path, { query });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
