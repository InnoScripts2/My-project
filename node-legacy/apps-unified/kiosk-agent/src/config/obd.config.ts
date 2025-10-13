/**
 * OBD Configuration Module
 * Loads and validates OBD workflow configuration from environment
 */

import { z } from 'zod';

// Zod schemas for validation
const ConnectionConfigSchema = z.object({
  maxRetries: z.number().min(1).max(10).default(3),
  timeout: z.number().min(5000).max(60000).default(15000),
  autoDetect: z.boolean().default(true),
  retryInterval: z.number().min(1000).max(30000).default(5000),
  deviceName: z.string().optional(),
  canFdEnabled: z.boolean().default(true),
});

const ScanningConfigSchema = z.object({
  duration: z.number().min(10000).max(300000).default(60000),
  pollingInterval: z.number().min(100).max(5000).default(1000),
  collectVendorData: z.boolean().default(true),
  includeDTC: z.boolean().default(true),
  includePIDs: z.boolean().default(true),
  includeVIN: z.boolean().default(true),
});

const PaymentConfigSchema = z.object({
  amount: z.number().min(1).max(1000000).default(48000), // kopecks
  timeout: z.number().min(30000).max(600000).default(300000), // 5 minutes
  pollInterval: z.number().min(1000).max(10000).default(2000),
  currency: z.string().default('RUB'),
});

const ReportingConfigSchema = z.object({
  pdfEngine: z.enum(['puppeteer', 'pdfkit', 'html']).default('puppeteer'),
  paths: z.object({
    templates: z.string().default('./templates'),
    output: z.string().default('./reports'),
  }),
  retention: z.number().min(1).max(365).default(30), // days
  delivery: z.object({
    retryAttempts: z.number().min(1).max(10).default(3),
    retryDelay: z.number().min(1000).max(60000).default(5000),
  }),
});

const LocksConfigSchema = z.object({
  timeouts: z.object({
    unlock: z.number().min(5000).max(60000).default(30000),
    waitReturn: z.number().min(60000).max(600000).default(300000), // 5 minutes
    autoClose: z.number().min(60000).max(600000).default(300000),
  }),
});

const DevConfigSchema = z.object({
  enableMock: z.boolean().default(false),
  skipPayment: z.boolean().default(false),
  mockScenario: z.enum(['success', 'connection_failed', 'scan_failed', 'payment_failed', 'report_failed', 'partial_data']).optional(),
  autoCompleteAdapter: z.boolean().default(false),
  reducedTimeouts: z.boolean().default(false),
});

export const ObdConfigSchema = z.object({
  connection: ConnectionConfigSchema,
  scanning: ScanningConfigSchema,
  payment: PaymentConfigSchema,
  reporting: ReportingConfigSchema,
  locks: LocksConfigSchema,
  dev: DevConfigSchema,
});

export type ObdConfig = z.infer<typeof ObdConfigSchema>;

/**
 * Load OBD configuration from environment
 */
export function loadObdConfig(): ObdConfig {
  const env = process.env.AGENT_ENV || 'DEV';
  const isDev = env === 'DEV';
  const isProd = env === 'PROD';

  const config: ObdConfig = {
    connection: {
      maxRetries: parseInt(process.env.OBD_CONNECTION_RETRIES || '3'),
      timeout: parseInt(process.env.OBD_CONNECTION_TIMEOUT || '15000'),
      autoDetect: process.env.OBD_AUTO_DETECT !== 'false',
      retryInterval: parseInt(process.env.OBD_RETRY_INTERVAL || '5000'),
      deviceName: process.env.OBD_DEVICE_NAME,
      canFdEnabled: process.env.OBD_CAN_FD !== 'false',
    },
    scanning: {
      duration: parseInt(process.env.OBD_SCAN_DURATION || '60000'),
      pollingInterval: parseInt(process.env.OBD_POLLING_INTERVAL || '1000'),
      collectVendorData: process.env.OBD_COLLECT_VENDOR_DATA !== 'false',
      includeDTC: process.env.OBD_INCLUDE_DTC !== 'false',
      includePIDs: process.env.OBD_INCLUDE_PIDS !== 'false',
      includeVIN: process.env.OBD_INCLUDE_VIN !== 'false',
    },
    payment: {
      amount: parseInt(process.env.OBD_PAYMENT_AMOUNT || '48000'),
      timeout: parseInt(process.env.OBD_PAYMENT_TIMEOUT || '300000'),
      pollInterval: parseInt(process.env.OBD_PAYMENT_POLL_INTERVAL || '2000'),
      currency: process.env.OBD_PAYMENT_CURRENCY || 'RUB',
    },
    reporting: {
      pdfEngine: (process.env.OBD_PDF_ENGINE as any) || 'puppeteer',
      paths: {
        templates: process.env.OBD_TEMPLATES_PATH || './templates',
        output: process.env.OBD_REPORTS_PATH || './reports',
      },
      retention: parseInt(process.env.OBD_REPORT_RETENTION_DAYS || '30'),
      delivery: {
        retryAttempts: parseInt(process.env.OBD_DELIVERY_RETRY_ATTEMPTS || '3'),
        retryDelay: parseInt(process.env.OBD_DELIVERY_RETRY_DELAY || '5000'),
      },
    },
    locks: {
      timeouts: {
        unlock: parseInt(process.env.OBD_LOCK_UNLOCK_TIMEOUT || '30000'),
        waitReturn: parseInt(process.env.OBD_LOCK_WAIT_RETURN_TIMEOUT || '300000'),
        autoClose: parseInt(process.env.OBD_LOCK_AUTO_CLOSE_TIMEOUT || '300000'),
      },
    },
    dev: {
      enableMock: isDev && process.env.OBD_MOCK_ENABLED === 'true',
      skipPayment: isDev && process.env.OBD_SKIP_PAYMENT === 'true',
      mockScenario: process.env.OBD_MOCK_SCENARIO as any,
      autoCompleteAdapter: isDev && process.env.OBD_AUTO_COMPLETE_ADAPTER === 'true',
      reducedTimeouts: isDev && process.env.OBD_REDUCED_TIMEOUTS === 'true',
    },
  };

  // Validate configuration
  const validationResult = ObdConfigSchema.safeParse(config);

  if (!validationResult.success) {
    console.error('OBD Configuration validation failed:');
    console.error(JSON.stringify(validationResult.error.issues, null, 2));
    throw new Error('Invalid OBD configuration');
  }

  // Apply reduced timeouts in dev mode if enabled
  if (config.dev.reducedTimeouts) {
    config.connection.timeout = Math.min(config.connection.timeout, 5000);
    config.scanning.duration = Math.min(config.scanning.duration, 10000);
    config.payment.timeout = Math.min(config.payment.timeout, 30000);
    config.locks.timeouts.waitReturn = Math.min(config.locks.timeouts.waitReturn, 60000);
  }

  // Enforce PROD restrictions
  if (isProd) {
    config.dev.enableMock = false;
    config.dev.skipPayment = false;
    config.dev.autoCompleteAdapter = false;
  }

  return validationResult.data;
}

/**
 * Get configuration with overrides for testing
 */
export function getObdConfig(overrides?: Partial<ObdConfig>): ObdConfig {
  const config = loadObdConfig();
  return {
    ...config,
    ...overrides,
  };
}

/**
 * Validate configuration at startup
 */
export function validateObdConfig(config: ObdConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check connection settings
  if (config.connection.maxRetries < 1) {
    errors.push('Connection max retries must be at least 1');
  }

  if (config.connection.timeout < 5000) {
    errors.push('Connection timeout must be at least 5000ms');
  }

  // Check scanning settings
  if (config.scanning.duration < 10000) {
    errors.push('Scan duration must be at least 10000ms');
  }

  // Check payment settings
  if (config.payment.amount < 1) {
    errors.push('Payment amount must be positive');
  }

  // Check reporting settings
  if (config.reporting.retention < 1) {
    errors.push('Report retention must be at least 1 day');
  }

  // Check locks settings
  if (config.locks.timeouts.unlock < 5000) {
    errors.push('Lock unlock timeout must be at least 5000ms');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Log configuration (without sensitive data)
 */
export function logObdConfig(config: ObdConfig): void {
  const sanitized = {
    connection: {
      maxRetries: config.connection.maxRetries,
      timeout: config.connection.timeout,
      autoDetect: config.connection.autoDetect,
    },
    scanning: {
      duration: config.scanning.duration,
      pollingInterval: config.scanning.pollingInterval,
    },
    payment: {
      amount: config.payment.amount,
      timeout: config.payment.timeout,
      currency: config.payment.currency,
    },
    reporting: {
      pdfEngine: config.reporting.pdfEngine,
      retention: config.reporting.retention,
    },
    dev: config.dev,
  };

  console.log('[ObdConfig] Configuration loaded:', JSON.stringify(sanitized, null, 2));
}
