import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { obdSessionManager } from '../../integrations/obd/session-manager.js';
import { obdReportGenerator } from '../../integrations/obd/report-generator.js';
import { sendReportEmail } from '../../reports/mailer.js';
import { sendSms } from '../../reports/sms.js';
import { getMailConfigFromEnv } from '../../reports/mailer.js';
import { getSmsConfigFromEnv } from '../../reports/sms.js';
import path from 'path';
import os from 'node:os';

const generateReportSchema = z.object({
  sessionId: z.string().min(1),
});

const sendReportSchema = z.object({
  sessionId: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
}).refine(data => data.email || data.phone, {
  message: 'At least one of email or phone is required',
});

export function createObdReportRoutes(): Router {
  const router = Router();

  // Generate report
  router.post('/api/obd/report/generate', async (req: Request, res: Response) => {
    const parsed = generateReportSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { sessionId } = parsed.data;
    const session = obdSessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        ok: false,
        error: 'session_not_found',
        message: `Session ${sessionId} not found`,
      });
      return;
    }

    if (session.status !== 'paid') {
      res.status(403).json({
        ok: false,
        error: 'payment_required',
        message: 'Session must be paid before generating report',
      });
      return;
    }

    try {
      // Determine report type
      const isHybrid = (session.vehicleMake === 'Toyota' || session.vehicleMake === 'Lexus') 
        && session.vendorData?.hvBattery;
      const reportType = isHybrid ? 'hybrid' : 'standard';

      const reportBuffer = await obdReportGenerator.generateReport(session, { type: reportType });
      const reportPath = await obdReportGenerator.saveReport(sessionId, reportBuffer);

      res.json({
        ok: true,
        success: true,
        reportPath,
        size: reportBuffer.length,
      });
    } catch (error: any) {
      console.error('[obd-report] generate failed:', error);
      res.status(500).json({
        ok: false,
        error: 'report_generation_failed',
        message: error?.message || String(error),
      });
    }
  });

  // Send report
  router.post('/api/obd/report/send', async (req: Request, res: Response) => {
    const parsed = sendReportSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { sessionId, email, phone } = parsed.data;
    const session = obdSessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        ok: false,
        error: 'session_not_found',
        message: `Session ${sessionId} not found`,
      });
      return;
    }

    try {
      const reportBuffer = await obdReportGenerator.getReport(sessionId);
      
      if (!reportBuffer) {
        res.status(404).json({
          ok: false,
          error: 'report_not_found',
          message: 'Report not generated yet',
        });
        return;
      }

      const sentTo: string[] = [];

      // Send email
      if (email) {
        const mailConfig = getMailConfigFromEnv();
        if (mailConfig) {
          const outboxRoot = process.env.REPORTS_OUTBOX || path.join(os.tmpdir(), 'kiosk-agent-outbox');
          const reportPath = path.join(outboxRoot, 'obd', `${sessionId}.html`);
          
          try {
            await sendReportEmail(
              email,
              'Отчёт OBD-II диагностики',
              reportPath,
              mailConfig
            );
            sentTo.push(email);
          } catch (err) {
            console.error('[obd-report] email send failed:', err);
          }
        }
      }

      // Send SMS
      if (phone) {
        const smsConfig = getSmsConfigFromEnv();
        if (smsConfig) {
          const baseUrl = process.env.KIOSK_BASE_URL || 'http://localhost:7070';
          const viewUrl = `${baseUrl}/api/obd/report/${sessionId}`;
          const message = `Отчёт OBD-II готов: ${viewUrl}`;
          const outboxRoot = process.env.REPORTS_OUTBOX || path.join(os.tmpdir(), 'kiosk-agent-outbox');
          
          try {
            await sendSms(phone, message, smsConfig, outboxRoot);
            sentTo.push(phone);
          } catch (err) {
            console.error('[obd-report] sms send failed:', err);
          }
        }
      }

      res.json({
        ok: true,
        success: true,
        sentTo,
      });
    } catch (error: any) {
      console.error('[obd-report] send failed:', error);
      res.status(500).json({
        ok: false,
        error: 'report_send_failed',
        message: error?.message || String(error),
      });
    }
  });

  // Get report
  router.get('/api/obd/report/:sessionId', async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    if (!sessionId) {
      res.status(400).send('Session ID required');
      return;
    }

    try {
      const reportBuffer = await obdReportGenerator.getReport(sessionId);
      
      if (!reportBuffer) {
        res.status(404).send('Report not found');
        return;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(reportBuffer);
    } catch (error: any) {
      console.error('[obd-report] get failed:', error);
      res.status(500).send('Failed to retrieve report');
    }
  });

  return router;
}
