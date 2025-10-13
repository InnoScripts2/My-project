/**
 * Reports service for kiosk-agent
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateDiagnosticsReport,
  generateThicknessReport,
  EmailService,
  SmsService,
  type DiagnosticsReportData,
  type ThicknessReportData,
  type EmailConfig,
  type SmsConfig,
  type ReportDeliveryResult,
} from '../../reporting/module.js';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ReportServiceConfig {
  reportsPath: string;
  emailConfig?: EmailConfig;
  smsConfig?: SmsConfig;
  dbPath?: string;
}

export interface ReportRecord {
  id: string;
  sessionId: string;
  type: 'diagnostics' | 'thickness';
  filePath: string;
  sentToEmail?: string;
  sentToPhone?: string;
  sentAt?: number;
  createdAt: number;
  metadata?: any;
}

export class ReportService {
  private reportsPath: string;
  private emailService?: EmailService;
  private smsService?: SmsService;
  private db: Database.Database;

  constructor(config: ReportServiceConfig) {
    this.reportsPath = config.reportsPath;

    if (config.emailConfig) {
      this.emailService = new EmailService(config.emailConfig);
    }

    if (config.smsConfig) {
      this.smsService = new SmsService(config.smsConfig);
    }

    const dbPath = config.dbPath || path.join(__dirname, '../../../storage/core.sqlite');
    this.db = new Database(dbPath);
  }

  async generateAndDeliverDiagnosticsReport(
    data: DiagnosticsReportData,
    deliverTo?: { email?: string; phone?: string }
  ): Promise<{ reportId: string; filePath: string; delivery?: ReportDeliveryResult }> {
    try {
      // Generate PDF
      const filePath = await generateDiagnosticsReport(data, {
        outputPath: this.reportsPath,
      });

      // Save to database
      const reportId = this.generateReportId('diagnostics');
      this.saveReport({
        id: reportId,
        sessionId: data.sessionId,
        type: 'diagnostics',
        filePath,
        createdAt: Date.now(),
      });

      let delivery: ReportDeliveryResult | undefined;

      // Deliver via email
      if (deliverTo?.email && this.emailService) {
        delivery = await this.emailService.sendReport(
          deliverTo.email,
          filePath,
          'diagnostics'
        );

        if (delivery.success) {
          this.updateReportDelivery(reportId, {
            sentToEmail: deliverTo.email,
            sentAt: Date.now(),
          });
        }
      }

      // Send SMS notification
      if (deliverTo?.phone && this.smsService) {
        await this.smsService.sendReportNotification(
          deliverTo.phone,
          'diagnostics',
          data.sessionId
        );
        
        this.updateReportDelivery(reportId, {
          sentToPhone: deliverTo.phone,
        });
      }

      return { reportId, filePath, delivery };

    } catch (error: any) {
      console.error('[ReportService] Diagnostics report error:', error);
      throw error;
    }
  }

  async generateAndDeliverThicknessReport(
    data: ThicknessReportData,
    deliverTo?: { email?: string; phone?: string }
  ): Promise<{ reportId: string; filePath: string; delivery?: ReportDeliveryResult }> {
    try {
      // Generate PDF
      const filePath = await generateThicknessReport(data, {
        outputPath: this.reportsPath,
      });

      // Save to database
      const reportId = this.generateReportId('thickness');
      this.saveReport({
        id: reportId,
        sessionId: data.sessionId,
        type: 'thickness',
        filePath,
        createdAt: Date.now(),
      });

      let delivery: ReportDeliveryResult | undefined;

      // Deliver via email
      if (deliverTo?.email && this.emailService) {
        delivery = await this.emailService.sendReport(
          deliverTo.email,
          filePath,
          'thickness'
        );

        if (delivery.success) {
          this.updateReportDelivery(reportId, {
            sentToEmail: deliverTo.email,
            sentAt: Date.now(),
          });
        }
      }

      // Send SMS notification
      if (deliverTo?.phone && this.smsService) {
        await this.smsService.sendReportNotification(
          deliverTo.phone,
          'thickness',
          data.sessionId
        );
        
        this.updateReportDelivery(reportId, {
          sentToPhone: deliverTo.phone,
        });
      }

      return { reportId, filePath, delivery };

    } catch (error: any) {
      console.error('[ReportService] Thickness report error:', error);
      throw error;
    }
  }

  getReport(reportId: string): ReportRecord | null {
    const stmt = this.db.prepare('SELECT * FROM reports WHERE id = ?');
    const row = stmt.get(reportId) as any;
    
    if (!row) return null;

    return this.rowToReport(row);
  }

  listReportsBySession(sessionId: string): ReportRecord[] {
    const stmt = this.db.prepare('SELECT * FROM reports WHERE session_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(sessionId) as any[];
    return rows.map(row => this.rowToReport(row));
  }

  private saveReport(record: ReportRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO reports (id, session_id, type, file_path, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.id,
      record.sessionId,
      record.type,
      record.filePath,
      record.createdAt,
      JSON.stringify(record.metadata || {})
    );
  }

  private updateReportDelivery(
    reportId: string,
    update: { sentToEmail?: string; sentToPhone?: string; sentAt?: number }
  ): void {
    const updates: string[] = [];
    const params: any[] = [];

    if (update.sentToEmail) {
      updates.push('sent_to_email = ?');
      params.push(update.sentToEmail);
    }

    if (update.sentToPhone) {
      updates.push('sent_to_phone = ?');
      params.push(update.sentToPhone);
    }

    if (update.sentAt) {
      updates.push('sent_at = ?');
      params.push(update.sentAt);
    }

    if (updates.length === 0) return;

    params.push(reportId);

    const stmt = this.db.prepare(`
      UPDATE reports SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);
  }

  private generateReportId(type: string): string {
    const prefix = type === 'diagnostics' ? 'RPT-DIAG' : 'RPT-THK';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  private rowToReport(row: any): ReportRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      type: row.type,
      filePath: row.file_path,
      sentToEmail: row.sent_to_email || undefined,
      sentToPhone: row.sent_to_phone || undefined,
      sentAt: row.sent_at || undefined,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }

  close(): void {
    this.db.close();
  }
}
