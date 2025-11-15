/**
 * Payment Client
 * 
 * Frontend client для работы с платежной системой агента.
 * Используется для интеграции paywall в UI потоках.
 */

const API_BASE = window.location.origin;

/**
 * Создание платежного намерения
 * 
 * @param {number} amount - Сумма в копейках
 * @param {string} currency - Валюта (по умолчанию RUB)
 * @param {string} service - Тип услуги (thickness, diagnostics)
 * @param {string} sessionId - ID сессии клиента
 * @param {Record<string, unknown>} meta - Дополнительные метаданные
 * @returns {Promise<PaymentIntent>}
 */
export async function createIntent(amount, currency = 'RUB', service, sessionId, meta = {}) {
  const response = await fetch(`${API_BASE}/api/payments/intents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency,
      service,
      sessionId,
      meta,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'network_error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Получение статуса платежного намерения
 * 
 * @param {string} intentId - ID платежного намерения
 * @returns {Promise<PaymentStatus>}
 */
export async function getStatus(intentId) {
  const response = await fetch(`${API_BASE}/api/payments/intents/${intentId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('intent_not_found');
    }
    const error = await response.json().catch(() => ({ error: 'network_error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Отмена платежного намерения
 * 
 * @param {string} intentId - ID платежного намерения
 * @returns {Promise<{ok: boolean, status: string}>}
 */
export async function cancelIntent(intentId) {
  const response = await fetch(`${API_BASE}/api/payments/intents/${intentId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('intent_not_found');
    }
    const error = await response.json().catch(() => ({ error: 'network_error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Подтверждение платежа (только DEV режим)
 * 
 * @param {string} intentId - ID платежного намерения
 * @returns {Promise<{ok: boolean, status: string}>}
 */
export async function confirmDevIntent(intentId) {
  const response = await fetch(`${API_BASE}/api/payments/intents/${intentId}/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('dev_only_endpoint');
    }
    if (response.status === 404) {
      throw new Error('intent_not_found');
    }
    const error = await response.json().catch(() => ({ error: 'network_error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Polling статуса платежа до финального состояния
 * 
 * @param {string} intentId - ID платежного намерения
 * @param {Object} options - Опции polling
 * @param {number} options.maxAttempts - Максимальное количество попыток (по умолчанию 150)
 * @param {number} options.intervalMs - Интервал между попытками в мс (по умолчанию 2000)
 * @param {Function} options.onStatusChange - Callback при изменении статуса
 * @returns {Promise<{confirmed: boolean, status: string, intent?: object}>}
 */
export async function pollStatus(intentId, options = {}) {
  const maxAttempts = options.maxAttempts || 150; // 150 * 2s = 5 минут
  const intervalMs = options.intervalMs || 2000;
  const onStatusChange = options.onStatusChange || (() => {});

  let lastStatus = null;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const statusData = await getStatus(intentId);
      const currentStatus = statusData.status;

      if (currentStatus !== lastStatus) {
        lastStatus = currentStatus;
        onStatusChange(currentStatus, statusData);
      }

      // Финальные статусы
      if (currentStatus === 'succeeded') {
        return { confirmed: true, status: currentStatus, intent: statusData };
      }

      if (currentStatus === 'failed' || currentStatus === 'expired') {
        return { confirmed: false, status: currentStatus, intent: statusData };
      }

      // Ожидание перед следующей попыткой
      await sleep(intervalMs);
    } catch (error) {
      console.warn(`[payment-client] polling attempt ${i + 1} failed:`, error);
      
      // Если intent не найден, прекращаем polling
      if (error.message === 'intent_not_found') {
        return { confirmed: false, status: 'not_found' };
      }

      // При сетевых ошибках продолжаем polling
      await sleep(intervalMs);
    }
  }

  // Таймаут polling
  return { confirmed: false, status: 'timeout' };
}

/**
 * Утилита sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Генерация уникального ID сессии
 */
export function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * @typedef {Object} PaymentIntent
 * @property {string} id - ID платежного намерения
 * @property {string} provider - Провайдер платежей
 * @property {string} qr_url - URL для QR кода
 * @property {string} qr_svg - SVG данные QR кода
 * @property {string} expires_at - Время истечения
 */

/**
 * @typedef {Object} PaymentStatus
 * @property {string} id - ID платежного намерения
 * @property {string} status - Статус (pending, succeeded, failed, expired)
 * @property {string} updated_at - Время последнего обновления
 */
