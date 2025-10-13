/**
 * Configuration schema with Zod validation
 */

import { z } from 'zod';

export const LockDriverConfigSchema = z.object({
  deviceType: z.enum(['thickness', 'obd']),
  driverType: z.enum(['mock', 'serial-relay', 'gpio']),
  driverConfig: z.record(z.any()).optional()
});

export const ConfigSchema = z.object({
  // Environment
  AGENT_ENV: z.enum(['PROD']).default('PROD'),
  PORT: z.coerce.number().min(1000).max(65535).default(4003),

  // SQLite
  SQLITE_PATH: z.string().default('./data/kiosk.db'),

  // Supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_KEY: z.string().min(10).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10).optional(),

  // Locks
  LOCK_CONFIGS: z.string()
    .transform(val => {
      try {
        return JSON.parse(val);
      } catch {
        return [];
      }
    })
    .pipe(z.array(LockDriverConfigSchema))
    .optional(),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FILE: z.string().optional(),
  LOG_ROTATION_MAX_SIZE: z.coerce.number().default(20 * 1024 * 1024), // 20MB
  LOG_ROTATION_MAX_AGE: z.coerce.number().default(14), // 14 days

  // Health checks
  HEALTH_CHECK_INTERVAL: z.coerce.number().min(10).max(300).default(60),

  // Metrics
  METRICS_ENABLED: z.coerce.boolean().default(true),

  // Admin API
  ADMIN_API_KEYS: z.string()
    .transform(val => {
      try {
        return JSON.parse(val);
      } catch {
        return {};
      }
    })
    .pipe(z.record(z.string()))
    .optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type LockDriverConfig = z.infer<typeof LockDriverConfigSchema>;
