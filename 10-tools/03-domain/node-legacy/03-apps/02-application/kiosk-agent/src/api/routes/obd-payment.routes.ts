import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { obdSessionManager } from '../../integrations/obd/session-manager.js';
import { ObdPaymentAdapter } from '../../integrations/obd/payment-adapter.js';

const createPaymentSchema = z.object({
  sessionId: z.string().min(1),
});

const confirmPaymentSchema = z.object({
  intentId: z.string().min(1),
});

export function createObdPaymentRoutes(paymentAdapter: ObdPaymentAdapter): Router {
  const router = Router();

  // Create payment intent for diagnostics
  router.post('/api/obd/payment/create', async (req: Request, res: Response) => {
    const parsed = createPaymentSchema.safeParse(req.body);
    
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

    if (session.status === 'paid') {
      res.status(400).json({
        ok: false,
        error: 'already_paid',
        message: 'Session already paid',
      });
      return;
    }

    if (session.status !== 'completed') {
      res.status(400).json({
        ok: false,
        error: 'session_not_completed',
        message: 'Session must be completed before creating payment',
      });
      return;
    }

    try {
      const payment = await paymentAdapter.createDiagnosticsPayment(sessionId);
      
      res.json({
        ok: true,
        intentId: payment.intentId,
        qrCode: payment.qrCode,
        amount: payment.amount,
        currency: payment.currency,
      });
    } catch (error: any) {
      console.error('[obd-payment] create failed:', error);
      res.status(500).json({
        ok: false,
        error: 'payment_creation_failed',
        message: error?.message || String(error),
      });
    }
  });

  // Check payment status
  router.get('/api/obd/payment/status/:intentId', async (req: Request, res: Response) => {
    const { intentId } = req.params;

    if (!intentId) {
      res.status(400).json({
        ok: false,
        error: 'intent_id_required',
      });
      return;
    }

    try {
      const status = await paymentAdapter.checkPaymentStatus(intentId);
      
      res.json({
        ok: true,
        status: status.status,
        timestamp: status.timestamp,
      });
    } catch (error: any) {
      console.error('[obd-payment] status check failed:', error);
      res.status(500).json({
        ok: false,
        error: 'status_check_failed',
        message: error?.message || String(error),
      });
    }
  });

  // Confirm payment (DEV mode)
  router.post('/api/obd/payment/confirm', async (req: Request, res: Response) => {
    const parsed = confirmPaymentSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { intentId } = parsed.data;

    try {
      const success = await paymentAdapter.confirmPayment(intentId);
      
      if (!success) {
        res.status(400).json({
          ok: false,
          error: 'confirmation_failed',
          message: 'Payment confirmation failed',
        });
        return;
      }

      const sessionId = paymentAdapter.getSessionIdFromIntent(intentId);
      
      res.json({
        ok: true,
        success: true,
        sessionId,
      });
    } catch (error: any) {
      console.error('[obd-payment] confirm failed:', error);
      res.status(500).json({
        ok: false,
        error: 'confirmation_error',
        message: error?.message || String(error),
      });
    }
  });

  return router;
}
