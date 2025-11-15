/**
 * Configuration loader with validation and hot-reload support
 */

import { Config, ConfigSchema } from './schema.js';
import { EventEmitter } from 'events';

type ConfigWatcher = () => void;

export class ConfigLoader extends EventEmitter {
  private config: Config;
  private watchers: Map<string, ConfigWatcher[]> = new Map();
  private immutableKeys = new Set(['SQLITE_PATH', 'AGENT_ENV']);

  constructor() {
    super();
    this.config = this.loadConfig();
  }

  /**
   * Load and validate configuration from environment
   */
  private loadConfig(): Config {
    try {
      const envConfig = {
        AGENT_ENV: process.env.AGENT_ENV,
        PORT: process.env.PORT,
        SQLITE_PATH: process.env.SQLITE_PATH,
        SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_KEY: process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        LOCK_CONFIGS: process.env.LOCK_CONFIGS,
        LOG_LEVEL: process.env.LOG_LEVEL,
        LOG_FILE: process.env.LOG_FILE,
        LOG_ROTATION_MAX_SIZE: process.env.LOG_ROTATION_MAX_SIZE,
        LOG_ROTATION_MAX_AGE: process.env.LOG_ROTATION_MAX_AGE,
        HEALTH_CHECK_INTERVAL: process.env.HEALTH_CHECK_INTERVAL,
        METRICS_ENABLED: process.env.METRICS_ENABLED,
        ADMIN_API_KEYS: process.env.ADMIN_API_KEYS,
      };

      const parsed = ConfigSchema.parse(envConfig);
      
      // Provide defaults for optional arrays
      return {
        ...parsed,
        LOCK_CONFIGS: parsed.LOCK_CONFIGS || [],
        ADMIN_API_KEYS: parsed.ADMIN_API_KEYS || {}
      };
    } catch (error: any) {
      console.error('[Config] Validation failed:', error.errors || error.message);
      throw new Error(`Configuration validation failed: ${error.message}`);
    }
  }

  /**
   * Reload configuration from environment
   */
  async reload(): Promise<{ changed: string[]; immutableChanged: string[] }> {
    const oldConfig = this.config;
    const newConfig = this.loadConfig();
    
    const changed: string[] = [];
    const immutableChanged: string[] = [];
    
    for (const key of Object.keys(newConfig) as Array<keyof Config>) {
      if (JSON.stringify(oldConfig[key]) !== JSON.stringify(newConfig[key])) {
        changed.push(key);
        
        if (this.immutableKeys.has(key)) {
          immutableChanged.push(key);
        }
      }
    }
    
    if (immutableChanged.length > 0) {
      console.warn('[Config] Immutable keys changed, restart required:', immutableChanged);
    }
    
    this.config = newConfig;
    
    // Notify watchers
    for (const key of changed) {
      const keyWatchers = this.watchers.get(key) || [];
      for (const watcher of keyWatchers) {
        try {
          watcher();
        } catch (error) {
          console.error(`[Config] Watcher error for key ${key}:`, error);
        }
      }
    }
    
    this.emit('reload', { changed, immutableChanged });
    
    return { changed, immutableChanged };
  }

  /**
   * Watch for changes to a specific config key
   */
  watch(key: keyof Config, callback: ConfigWatcher): void {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, []);
    }
    this.watchers.get(key)!.push(callback);
  }

  /**
   * Get a specific config value
   */
  get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  /**
   * Get entire config (sanitized for external exposure)
   */
  getAll(sanitized = false): Config | Record<string, any> {
    if (!sanitized) {
      return { ...this.config };
    }
    
    // Sanitize sensitive fields
    const sanitizedConfig: any = { ...this.config };
    
    if (sanitizedConfig.SUPABASE_KEY) {
      sanitizedConfig.SUPABASE_KEY = '***';
    }
    if (sanitizedConfig.SUPABASE_SERVICE_ROLE_KEY) {
      sanitizedConfig.SUPABASE_SERVICE_ROLE_KEY = '***';
    }
    if (sanitizedConfig.ADMIN_API_KEYS) {
      sanitizedConfig.ADMIN_API_KEYS = Object.keys(sanitizedConfig.ADMIN_API_KEYS).reduce(
        (acc, key) => ({ ...acc, [key]: '***' }),
        {}
      );
    }
    
    return sanitizedConfig;
  }

  /**
   * Check if a key is immutable (requires restart)
   */
  isImmutable(key: keyof Config): boolean {
    return this.immutableKeys.has(key);
  }
}

// Singleton instance
export const config = new ConfigLoader();
