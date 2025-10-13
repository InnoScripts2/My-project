/**
 * SMS delivery service
 */

import type { SmsConfig, ReportDeliveryResult } from './types.js';

export class SmsService {
  private config: SmsConfig;

  constructor(config: SmsConfig) {
    this.config = config;
  }

  async sendNotification(
    to: string,
    message: string
  ): Promise<ReportDeliveryResult> {
    try {
      if (this.config.provider === 'dev') {
        console.log(`[SmsService DEV] Would send SMS to: ${to}`);
        console.log(`[SmsService DEV] Message: ${message}`);
        
        return {
          success: true,
          deliveryId: `dev-sms-${Date.now()}`,
        };
      }

      // Placeholder for real SMS providers
      // TODO: Implement Twilio, SMSC, etc.
      console.warn('[SmsService] Real SMS providers not yet implemented');
      
      return {
        success: false,
        error: 'SMS provider not configured',
      };

    } catch (error: any) {
      console.error('[SmsService] Send error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async sendReportNotification(
    to: string,
    reportType: 'diagnostics' | 'thickness',
    sessionId: string
  ): Promise<ReportDeliveryResult> {
    const message = `Ваш отчет ${reportType === 'diagnostics' ? 'диагностики' : 'толщинометрии'} готов! Сессия: ${sessionId}`;
    return this.sendNotification(to, message);
  }
}
