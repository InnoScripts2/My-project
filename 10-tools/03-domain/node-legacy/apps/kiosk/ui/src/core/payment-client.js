import { apiClient } from './api-client.js';
import { config } from './config.js';

export async function createPaymentIntent(amount, meta = {}) {
  return apiClient.post('/payments/intent', {
    amount,
    currency: 'RUB',
    meta,
  });
}

export async function getPaymentStatus(intentId) {
  return apiClient.get(`/payments/${encodeURIComponent(intentId)}/status`);
}

export async function confirmPaymentDev(intentId) {
  return apiClient.post('/payments/confirm-dev', { id: intentId });
}

export function startPaymentPolling(intentId, onUpdate, intervalMs = 2000) {
  let stopped = false;

  async function tick() {
    if (stopped) {
      return;
    }

    try {
      const status = await getPaymentStatus(intentId);
      
      if (typeof onUpdate === 'function') {
        onUpdate(status);
      }

      if (status && (status.status === 'succeeded' || 
                     status.status === 'canceled' || 
                     status.status === 'failed')) {
        stopped = true;
        return;
      }
    } catch (err) {
      console.warn('[payment] Poll failed:', err);
    }

    if (!stopped) {
      setTimeout(tick, intervalMs);
    }
  }

  tick();

  return () => {
    stopped = true;
  };
}

export function initPaymentClient() {
  console.log('[payment] Payment client initialized');
}
