import { getRuntimeConfig } from './runtimeConfig';

export type SSEStatus = 'connecting' | 'open' | 'error' | 'closed';

export function createSSE(onMessage: (data: unknown) => void) {
  const cfg = getRuntimeConfig();
  const url = (cfg?.SSE_URL && cfg?.API_BASE_URL)
    ? new URL(cfg.SSE_URL, cfg.API_BASE_URL).toString()
    : '/api/events';

  let es: EventSource | null = null;
  let status: SSEStatus = 'connecting';
  const listeners: Array<(s: SSEStatus) => void> = [];

  function notify() { listeners.forEach(fn => fn(status)); }

  function open() {
    if (es) return;
    status = 'connecting';
    notify();
    es = new EventSource(url, { withCredentials: false });
    es.onopen = () => { status = 'open'; notify(); };
    es.onerror = () => { status = 'error'; notify(); restart(); };
    es.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch { /* noop */ }
    };
  }

  let timer: number | null = null;
  function restart() {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = null;
      close();
      open();
    }, 3000);
  }

  function close() {
    if (es) {
      es.close();
      es = null;
    }
    status = 'closed';
    notify();
  }

  function subscribe(listener: (s: SSEStatus) => void) {
    listeners.push(listener);
    return () => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  open();

  return { close, subscribe };
}
