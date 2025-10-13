/**
 * Report types and interfaces
 */

export interface DiagnosticsReportData {
  sessionId: string;
  vehicleMake: string;
  vehicleModel: string;
  dtcCodes: Array<{
    code: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  timestamp: string;
  cleared?: boolean;
  clearedAt?: string;
}

export interface ThicknessReportData {
  sessionId: string;
  vehicleType: string;
  measurements: Array<{
    zone: string;
    value: number;
    status: 'normal' | 'warning' | 'critical';
  }>;
  timestamp: string;
}

export interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'dev';
  from: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  };
  sendgrid?: {
    apiKey: string;
  };
}

export interface SmsConfig {
  provider: 'twilio' | 'smsc' | 'dev';
  from: string;
  twilio?: {
    accountSid: string;
    authToken: string;
  };
  smsc?: {
    login: string;
    password: string;
  };
}

export interface ReportGenerationOptions {
  outputPath: string;
  includeTimestamp?: boolean;
}

export interface ReportDeliveryResult {
  success: boolean;
  deliveryId?: string;
  error?: string;
}
