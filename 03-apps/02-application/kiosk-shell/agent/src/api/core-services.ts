/**
 * Core services integration module
 * Wires up sessions, payments, reports, and metrics services
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { SessionManager, SessionStore } from '../sessions/index.js';
import { PaymentService } from './services/payments.js';
import { ReportService } from './services/reports.js';
import { getMetricsService } from './services/metrics.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createPaymentsRoutes } from './routes/payments.js';
import { createReportsRoutes } from './routes/reports.js';
import { createMetricsRoute } from './routes/metrics.js';
import type { EmailConfig, SmsConfig } from '../reporting/module.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CoreServicesConfig {
  environment: 'DEV' | 'PROD';
  storagePath?: string;
  reportsPath?: string;
  emailConfig?: EmailConfig;
  smsConfig?: SmsConfig;
}

export class CoreServices {
  public readonly sessionManager: SessionManager;
  public readonly paymentService: PaymentService;
  public readonly reportService: ReportService;
  public readonly metricsService;
  private readonly environment: 'DEV' | 'PROD';

  constructor(config: CoreServicesConfig) {
    this.environment = config.environment;
    const metricsService = getMetricsService();
    this.metricsService = metricsService;

    const storagePath = config.storagePath || path.join(__dirname, '../../storage');
    const reportsPath = config.reportsPath || path.join(storagePath, 'reports');
    const dbPath = path.join(storagePath, 'core.sqlite');

    // Initialize session manager
    const sessionStore = new SessionStore(dbPath);
    this.sessionManager = new SessionManager(sessionStore, {
      defaultTtlMs: 3600000, // 1 hour
      autoResetOnTimeout: true,
    });

    // Initialize payment service
    const paymentProvider = config.environment === 'PROD' && process.env.YOOKASSA_SHOP_ID
      ? 'yookassa'
      : 'dev';

    this.paymentService = new PaymentService({
      environment: config.environment,
      provider: paymentProvider,
      devConfig: {
        autoConfirmDelayMs: 2000,
        manualMode: false,
      },
      yookassaConfig: paymentProvider === 'yookassa' ? {
        shopId: process.env.YOOKASSA_SHOP_ID || '',
        secretKey: process.env.YOOKASSA_SECRET_KEY || '',
        webhookUrl: process.env.YOOKASSA_WEBHOOK_URL,
      } : undefined,
      dbPath,
    });

    // Initialize report service
    this.reportService = new ReportService({
      reportsPath,
      emailConfig: config.emailConfig || this.getEmailConfigFromEnv(),
      smsConfig: config.smsConfig || this.getSmsConfigFromEnv(),
      dbPath,
    });

    console.log(`[CoreServices] Initialized with environment: ${config.environment}`);
    console.log(`[CoreServices] Payment provider: ${paymentProvider}`);
    console.log(`[CoreServices] Storage path: ${storagePath}`);
  }

  createRouter(): Router {
    const router = Router();

    // Mount all routes
    router.use('/api', createSessionRoutes(this.sessionManager));
    router.use('/api', createPaymentsRoutes(this.paymentService, this.environment));
    router.use('/api', createReportsRoutes(this.reportService));
    router.use('/', createMetricsRoute());

    return router;
  }

  private getEmailConfigFromEnv(): EmailConfig {
    const provider = (process.env.EMAIL_PROVIDER || 'dev').toLowerCase() as EmailConfig['provider'];
    
    return {
      provider,
      from: process.env.EMAIL_FROM || 'noreply@autoservice.local',
      smtp: provider === 'smtp' ? {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || '',
        } : undefined,
      } : undefined,
      sendgrid: provider === 'sendgrid' ? {
        apiKey: process.env.SENDGRID_API_KEY || '',
      } : undefined,
    };
  }

  private getSmsConfigFromEnv(): SmsConfig {
    const provider = (process.env.SMS_PROVIDER || 'dev').toLowerCase() as SmsConfig['provider'];
    
    return {
      provider,
      from: process.env.SMS_FROM || '+79000000000',
      twilio: provider === 'twilio' ? {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
      } : undefined,
    };
  }

  close(): void {
    this.sessionManager.close();
    this.paymentService.close();
    this.reportService.close();
    console.log('[CoreServices] Closed all services');
  }
}

// Export singleton instance creator
let coreServicesInstance: CoreServices | null = null;

export function initializeCoreServices(config: CoreServicesConfig): CoreServices {
  if (coreServicesInstance) {
    console.warn('[CoreServices] Already initialized, returning existing instance');
    return coreServicesInstance;
  }

  coreServicesInstance = new CoreServices(config);
  return coreServicesInstance;
}

export function getCoreServices(): CoreServices {
  if (!coreServicesInstance) {
    throw new Error('[CoreServices] Not initialized. Call initializeCoreServices first.');
  }
  return coreServicesInstance;
}
