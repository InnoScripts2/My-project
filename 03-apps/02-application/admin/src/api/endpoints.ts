import { apiFetch } from './client';
import {
  LoginRequest,
  LoginResponse,
  LoginResponseSchema,
  RefreshResponse,
  RefreshResponseSchema,
  SessionListResponse,
  SessionListResponseSchema,
  Session,
  SessionSchema,
  SessionLogsResponse,
  SessionLogsResponseSchema,
  MetricsResponse,
  MetricsResponseSchema,
  CommandResponse,
  CommandResponseSchema,
} from './schemas';

export interface SessionsQueryParams {
  page?: number;
  size?: number;
  q?: string;
  service?: 'OBD' | 'THICKNESS';
  status?: 'created' | 'running' | 'completed' | 'failed' | 'cancelled';
  from?: string;
  to?: string;
}

export interface SessionLogsQueryParams {
  cursor?: string;
}

export interface MetricsQueryParams {
  name?: string;
  range?: string;
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const response = await apiFetch<LoginResponse>('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  return LoginResponseSchema.parse(response);
}

export async function refreshAuth(): Promise<RefreshResponse> {
  const response = await apiFetch<RefreshResponse>('/admin/auth/refresh', {
    method: 'POST',
  });
  return RefreshResponseSchema.parse(response);
}

export async function getSessions(
  params?: SessionsQueryParams
): Promise<SessionListResponse> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
  }
  const queryString = searchParams.toString();
  const path = `/admin/sessions${queryString ? `?${queryString}` : ''}`;
  const response = await apiFetch<SessionListResponse>(path);
  return SessionListResponseSchema.parse(response);
}

export async function getSession(id: string): Promise<Session> {
  const response = await apiFetch<Session>(`/admin/sessions/${id}`);
  return SessionSchema.parse(response);
}

export async function getSessionLogs(
  id: string,
  params?: SessionLogsQueryParams
): Promise<SessionLogsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.cursor) {
    searchParams.append('cursor', params.cursor);
  }
  const queryString = searchParams.toString();
  const path = `/admin/sessions/${id}/logs${queryString ? `?${queryString}` : ''}`;
  const response = await apiFetch<SessionLogsResponse>(path);
  return SessionLogsResponseSchema.parse(response);
}

export async function getMetrics(params?: MetricsQueryParams): Promise<MetricsResponse> {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
  }
  const queryString = searchParams.toString();
  const path = `/admin/metrics${queryString ? `?${queryString}` : ''}`;
  const response = await apiFetch<MetricsResponse>(path);
  return MetricsResponseSchema.parse(response);
}

export async function executeCommand(
  sessionId: string,
  action: string
): Promise<CommandResponse> {
  const response = await apiFetch<CommandResponse>(
    `/admin/commands/${sessionId}/${action}`,
    {
      method: 'POST',
    }
  );
  return CommandResponseSchema.parse(response);
}
