/**
 * Email delivery service
 */

import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import type { EmailConfig, ReportDeliveryResult } from './types.js';

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;
    
    if (config.provider === 'smtp' && config.smtp) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.auth,
      });
    } else if (config.provider === 'sendgrid' && config.sendgrid) {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: config.sendgrid.apiKey,
        },
      });
    } else if (config.provider === 'dev') {
      // For dev mode, use a mock transporter that logs to console
      console.log('[EmailService] Running in DEV mode - emails will be logged');
    }
  }

  async sendReport(
    to: string,
    reportPath: string,
    reportType: 'diagnostics' | 'thickness'
  ): Promise<ReportDeliveryResult> {
    try {
      const subject = reportType === 'diagnostics' 
        ? 'Отчет диагностики OBD-II'
        : 'Отчет толщинометрии ЛКП';

      const text = `
Здравствуйте!

Во вложении находится отчет из автосервиса самообслуживания.

Тип отчета: ${reportType === 'diagnostics' ? 'Диагностика OBD-II' : 'Толщинометрия ЛКП'}

С уважением,
Автосервис самообслуживания
      `.trim();

      if (this.config.provider === 'dev') {
        // In DEV mode, just log
        console.log(`[EmailService DEV] Would send email to: ${to}`);
        console.log(`[EmailService DEV] Subject: ${subject}`);
        console.log(`[EmailService DEV] Attachment: ${reportPath}`);
        
        return {
          success: true,
          deliveryId: `dev-${Date.now()}`,
        };
      }

      if (!this.transporter) {
        throw new Error('Email transporter not configured');
      }

      const mailOptions = {
        from: this.config.from,
        to,
        subject,
        text,
        attachments: [
          {
            filename: path.basename(reportPath),
            path: reportPath,
          },
        ],
      };

      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        deliveryId: info.messageId,
      };

    } catch (error: any) {
      console.error('[EmailService] Send error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async verify(): Promise<boolean> {
    if (this.config.provider === 'dev') {
      return true;
    }

    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('[EmailService] Verification failed:', error);
      return false;
    }
  }
}
