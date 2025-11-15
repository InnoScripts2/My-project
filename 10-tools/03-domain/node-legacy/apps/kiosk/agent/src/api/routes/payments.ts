/**
 * Payment API routes
 */

import { Router } from 'express';
import type { PaymentService } from '../services/payments.js';

export function createPaymentsRoutes(
  paymentService: PaymentService,
  environment: 'DEV' | 'PROD'
): Router {
  const router = Router();

  // Create payment intent
  router.post('/payments/intent', async (req, res) => {
    try {
      const { amount, currency, sessionId, metadata } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      if (!currency || !['RUB', 'USD', 'EUR'].includes(currency)) {
        return res.status(400).json({ error: 'Invalid currency' });
      }

      const intent = await paymentService.createIntent({
        amount,
        currency,
        sessionId,
        metadata,
      });

      res.status(201).json(intent);
    } catch (error: any) {
      console.error('[Payments API] Create intent error:', error);
      res.status(500).json({ error: 'Failed to create payment intent' });
    }
  });

  // Get payment status
  router.get('/payments/status/:intentId', async (req, res) => {
    try {
      const status = await paymentService.getStatus(req.params.intentId);

      if (status === null) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      res.json({ intentId: req.params.intentId, status });
    } catch (error: any) {
      console.error('[Payments API] Get status error:', error);
      res.status(500).json({ error: 'Failed to get payment status' });
    }
  });

  // Get payment intent
  router.get('/payments/intent/:intentId', async (req, res) => {
    try {
      const intent = await paymentService.getIntent(req.params.intentId);

      if (!intent) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      res.json(intent);
    } catch (error: any) {
      console.error('[Payments API] Get intent error:', error);
      res.status(500).json({ error: 'Failed to get payment intent' });
    }
  });

  // Cancel payment
  router.post('/payments/cancel/:intentId', async (req, res) => {
    try {
      const canceled = await paymentService.cancel(req.params.intentId);

      if (!canceled) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      res.json({ success: true, intentId: req.params.intentId });
    } catch (error: any) {
      console.error('[Payments API] Cancel error:', error);
      res.status(500).json({ error: 'Failed to cancel payment' });
    }
  });

  // DEV-only: Manual confirmation endpoint
  router.post('/payments/confirm/:intentId', async (req, res) => {
    if (environment !== 'DEV') {
      return res.status(403).json({ 
        error: 'Manual confirmation only available in DEV mode' 
      });
    }

    try {
      const confirmed = await paymentService.confirmDev(req.params.intentId);

      if (!confirmed) {
        return res.status(400).json({ error: 'Failed to confirm payment' });
      }

      res.json({ success: true, intentId: req.params.intentId });
    } catch (error: any) {
      console.error('[Payments API] Confirm error:', error);
      res.status(500).json({ error: 'Failed to confirm payment' });
    }
  });

  // Webhook endpoint (for production PSP)
  router.post('/payments/webhook', async (req, res) => {
    try {
      const signature = req.headers['x-yookassa-signature'] as string;
      const processed = await paymentService.processWebhook(req.body, signature);

      if (!processed) {
        return res.status(400).json({ error: 'Failed to process webhook' });
      }

      res.status(200).send('OK');
    } catch (error: any) {
      console.error('[Payments API] Webhook error:', error);
      res.status(500).json({ error: 'Webhook processing error' });
    }
  });

  return router;
}
