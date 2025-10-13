export interface RuntimeConfig {
  apiBaseUrl: string;
  sseUrl: string;
  sentryDsn: string;
  otlpEndpoint: string;
  features: {
    enableSSE: boolean;
    enableOTel: boolean;
  };
}

const defaultConfig: RuntimeConfig = {
  apiBaseUrl: 'http://localhost:7070',
  sseUrl: 'http://localhost:7070/events',
  sentryDsn: '',
  otlpEndpoint: '',
  features: {
    enableSSE: true,
    enableOTel: false,
  },
};

let config: RuntimeConfig | null = null;

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (config) {
    return config;
  }

  let loadedConfig: RuntimeConfig;

  try {
    const response = await fetch('/admin/config/runtime.json');
    if (response.ok) {
      const data = await response.json();
      loadedConfig = { ...defaultConfig, ...data };
    } else {
      console.warn('Failed to load runtime.json, using defaults');
      loadedConfig = defaultConfig;
    }
  } catch (error) {
    console.warn('Error loading runtime.json, using defaults:', error);
    loadedConfig = defaultConfig;
  }

  config = loadedConfig;
  return loadedConfig;
}

export function getRuntimeConfigSync(): RuntimeConfig {
  if (!config) {
    console.warn('Runtime config not loaded, using defaults');
    return defaultConfig;
  }
  return config;
}
