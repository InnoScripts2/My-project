export type RuntimeConfig = {
  API_BASE_URL: string;
  WS_BASE_URL?: string;
  SSE_URL?: string;
  SENTRY_DSN?: string;
  ENV?: 'DEV' | 'QA' | 'PROD' | string;
};

let cachedConfig: RuntimeConfig | null = null;

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    // Пытаемся найти runtime.json по нескольким путям (dev/prod под base '/admin/')
    const candidates = [
      '/admin/config/runtime.json',
      '/config/runtime.json',
      '/admin/runtime.json',
      '/runtime.json',
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const raw = (await res.json()) as RuntimeConfig;
          cachedConfig = normalizeConfig(raw);
          // Диагностика успешной загрузки
          console.debug('[runtimeConfig] loaded from', url, '->', safePrintConfig(cachedConfig));
          return cachedConfig;
        }
        // Логируем не-200 статусы для ускорения диагностики
        console.debug('[runtimeConfig] candidate', url, 'returned status', res.status);
      } catch {
        // продолжим к следующему кандидату, но отметим неудачу
        console.debug('[runtimeConfig] candidate failed to load:', url);
      }
    }
    throw new Error('runtime.json not found in known locations');
  } catch {
    // Фоллбек на переменные окружения Vite
    const fallback: RuntimeConfig = {
      API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:7081',
      WS_BASE_URL: import.meta.env.VITE_WS_BASE_URL,
      SSE_URL: import.meta.env.VITE_SSE_URL,
      SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN ?? '',
      ENV: import.meta.env.MODE,
    };
    cachedConfig = normalizeConfig(fallback);
    console.warn('[runtimeConfig] using fallback from Vite env ->', safePrintConfig(cachedConfig));
    return cachedConfig;
  }
}

export function getRuntimeConfig(): RuntimeConfig | null {
  return cachedConfig;
}

// Нормализация относительных путей SSE/WS относительно origin из API_BASE_URL
function normalizeConfig(input: RuntimeConfig): RuntimeConfig {
  const api = input.API_BASE_URL?.trim();
  if (!api) throw new Error('API_BASE_URL is required in runtime config');
  const url = new URL(api);
  const origin = url.origin; // http(s)://host:port

  // Для socket.io используем HTTP(S) origin; клиент сам выберет транспорт
  const httpOrigin = origin;

  // SSE_URL: абсолютный URL. Если задан относительный путь — префиксуем origin
  let sse = input.SSE_URL?.trim();
  if (!sse || sse === '') {
    sse = `${origin}/api/events`;
  } else if (sse.startsWith('/')) {
    sse = `${origin}${sse}`;
  }

  // WS_BASE_URL: абсолютный URL. Если задан относительный путь — префиксуем httpOrigin
  let ws = input.WS_BASE_URL?.trim();
  if (!ws || ws === '') {
    ws = `${httpOrigin}`;
  } else if (ws.startsWith('/')) {
    ws = `${httpOrigin}${ws}`;
  }

  return {
    API_BASE_URL: api,
    WS_BASE_URL: ws,
    SSE_URL: sse,
    SENTRY_DSN: input.SENTRY_DSN ?? '',
    ENV: input.ENV ?? import.meta.env.MODE,
  };
}

// Безопасная печать (не выводим потенциальные секреты)
function safePrintConfig(cfg: RuntimeConfig) {
  return {
    API_BASE_URL: cfg.API_BASE_URL,
    WS_BASE_URL: cfg.WS_BASE_URL,
    SSE_URL: cfg.SSE_URL,
    ENV: cfg.ENV,
  };
}
