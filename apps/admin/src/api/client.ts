import { getRuntimeConfigSync } from '@/store/config';
import { getAccessToken } from '@/store/auth';

export interface ApiError {
  code?: string | number;
  message: string;
  details?: unknown;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const { apiBaseUrl } = getRuntimeConfigSync();
  const headers = new Headers(init.headers);

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = `${apiBaseUrl}${path}`;
  let attempt = 0;
  const maxAttempts = 4;

  for (;;) {
    try {
      const res = await fetch(url, { ...init, headers });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return (await res.json()) as T;
        }
        return (await res.text()) as T;
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxAttempts) {
          throw {
            code: res.status,
            message: `${res.status} ${res.statusText}`,
          } as ApiError;
        }
        await delay(300 * Math.pow(2, attempt));
        attempt++;
        continue;
      }

      let errorData: ApiError;
      try {
        const data = await res.json();
        errorData = {
          code: res.status,
          message: data.message || `${res.status} ${res.statusText}`,
          details: data,
        };
      } catch {
        errorData = {
          code: res.status,
          message: `${res.status} ${res.statusText}`,
        };
      }

      throw errorData;
    } catch (error) {
      if ((error as ApiError).code) {
        throw error;
      }

      if (attempt >= maxAttempts) {
        throw {
          message: error instanceof Error ? error.message : 'Network error',
          details: error,
        } as ApiError;
      }

      await delay(300 * Math.pow(2, attempt));
      attempt++;
    }
  }
}
