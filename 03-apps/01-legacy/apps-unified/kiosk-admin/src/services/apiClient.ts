import axios from 'axios';
import { getRuntimeConfig } from './runtimeConfig';

// При моках axios в тестах create/interceptors могут отсутствовать.
// Используем защиту, чтобы не падать.
const created = typeof (axios as any).create === 'function' ? (axios as any).create() : (axios as any);
export const api = created;

if (api && api.interceptors && api.interceptors.request && typeof api.interceptors.request.use === 'function') {
  api.interceptors.request.use((config: any) => {
    const cfg = getRuntimeConfig();
    if (cfg?.API_BASE_URL) {
      config.baseURL = cfg.API_BASE_URL;
    }
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
    return config;
  });
}
