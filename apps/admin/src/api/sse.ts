import { getRuntimeConfigSync } from '@/store/config';
import { getAccessToken } from '@/store/auth';

export type EventHandler = (event: unknown) => void;

export function connectEvents(onEvent: EventHandler): () => void {
  const { sseUrl, features } = getRuntimeConfigSync();

  if (!features.enableSSE) {
    console.info('SSE disabled in runtime config');
    return () => {};
  }

  const token = getAccessToken();
  const url = token ? `${sseUrl}?token=${encodeURIComponent(token)}` : sseUrl;

  let es: EventSource | null = null;
  let backoff = 1000;
  let reconnectTimer: number | null = null;

  const connect = () => {
    try {
      es = new EventSource(url);

      es.onmessage = m => {
        backoff = 1000;
        try {
          const data = JSON.parse(m.data);
          onEvent(data);
        } catch (error) {
          console.error('Failed to parse SSE event:', error);
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;

        reconnectTimer = window.setTimeout(() => {
          console.info(`Reconnecting SSE with backoff ${backoff}ms`);
          connect();
          backoff = Math.min(backoff * 2, 30000);
        }, backoff);
      };
    } catch (error) {
      console.error('Failed to connect SSE:', error);
      reconnectTimer = window.setTimeout(() => {
        connect();
        backoff = Math.min(backoff * 2, 30000);
      }, backoff);
    }
  };

  connect();

  return () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    es?.close();
  };
}
