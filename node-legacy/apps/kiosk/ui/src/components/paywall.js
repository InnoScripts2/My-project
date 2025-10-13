/**
 * Paywall Component
 * 
 * Компонент для отображения экрана оплаты с QR кодом
 * и polling статуса платежа.
 */

import { createIntent, pollStatus, confirmDevIntent, cancelIntent } from '../api/payment-client.js';

/**
 * Показать paywall экран
 * 
 * @param {Object} config - Конфигурация paywall
 * @param {number} config.amount - Сумма в копейках
 * @param {string} config.service - Тип услуги (thickness, diagnostics)
 * @param {string} config.sessionId - ID сессии
 * @param {string} config.containerId - ID контейнера для рендеринга
 * @param {Function} config.onSuccess - Callback при успешной оплате
 * @param {Function} config.onFailure - Callback при неудачной оплате
 * @param {Function} config.onCancel - Callback при отмене
 * @returns {Promise<void>}
 */
export async function showPaywall(config) {
  const {
    amount,
    service,
    sessionId,
    containerId = 'paywall-container',
    onSuccess = () => {},
    onFailure = () => {},
    onCancel = () => {},
  } = config;

  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`[paywall] Container #${containerId} not found`);
    return;
  }

  // Показать индикатор загрузки
  container.innerHTML = `
    <div class="paywall-loading">
      <div class="spinner"></div>
      <p>Подготовка оплаты...</p>
    </div>
  `;

  try {
    // Создать платежное намерение
    const intent = await createIntent(amount, 'RUB', service, sessionId);

    // Отобразить QR код и информацию
    renderPaywallUI(container, intent, amount);

    // Начать polling статуса
    const result = await pollStatus(intent.id, {
      maxAttempts: 150,
      intervalMs: 2000,
      onStatusChange: (status) => {
        updateStatusIndicator(container, status);
      },
    });

    if (result.confirmed) {
      // Успешная оплата
      renderSuccess(container);
      await sleep(1500);
      onSuccess(result);
    } else {
      // Неудачная оплата
      renderFailure(container, result.status);
      await sleep(3000);
      onFailure(result);
    }
  } catch (error) {
    console.error('[paywall] Error:', error);
    renderError(container, error.message);
    await sleep(3000);
    onFailure({ status: 'error', error });
  }
}

/**
 * Отрисовать UI paywall
 */
function renderPaywallUI(container, intent, amount) {
  const isDev = window.location.search.includes('dev=1') || 
                window.location.hostname === 'localhost';

  container.innerHTML = `
    <div class="paywall-screen">
      <div class="paywall-header">
        <h2>Оплата услуги</h2>
        <p class="paywall-amount">${formatAmount(amount)}</p>
      </div>

      <div class="paywall-qr-container">
        ${intent.qr_svg ? 
          `<div class="paywall-qr">${intent.qr_svg}</div>` :
          `<img src="${intent.qr_url}" class="paywall-qr" alt="QR код для оплаты" />`
        }
        <p class="paywall-instruction">
          Отсканируйте QR-код для оплаты через СБП
        </p>
      </div>

      <div class="paywall-status">
        <div class="status-indicator status-pending">
          <span class="status-dot"></span>
          <span class="status-text">Ожидание оплаты...</span>
        </div>
      </div>

      ${isDev ? `
        <div class="paywall-dev-controls">
          <button id="paywall-dev-confirm" class="btn btn-dev">
            Подтвердить оплату (DEV)
          </button>
        </div>
      ` : ''}

      <button id="paywall-cancel" class="btn btn-secondary">
        Отменить
      </button>
    </div>
  `;

  // Привязать обработчики
  const cancelBtn = container.querySelector('#paywall-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      try {
        await cancelIntent(intent.id);
        renderCancelled(container);
        await sleep(1500);
        window.paywallCancelCallback && window.paywallCancelCallback();
      } catch (error) {
        console.error('[paywall] Cancel failed:', error);
      }
    });
  }

  if (isDev) {
    const devConfirmBtn = container.querySelector('#paywall-dev-confirm');
    if (devConfirmBtn) {
      devConfirmBtn.addEventListener('click', async () => {
        try {
          await confirmDevIntent(intent.id);
          devConfirmBtn.disabled = true;
          devConfirmBtn.textContent = 'Подтверждено...';
        } catch (error) {
          console.error('[paywall] Dev confirm failed:', error);
          devConfirmBtn.textContent = 'Ошибка подтверждения';
        }
      });
    }
  }
}

/**
 * Обновить индикатор статуса
 */
function updateStatusIndicator(container, status) {
  const indicator = container.querySelector('.status-indicator');
  if (!indicator) return;

  indicator.className = 'status-indicator';

  switch (status) {
    case 'pending':
      indicator.classList.add('status-pending');
      indicator.querySelector('.status-text').textContent = 'Ожидание оплаты...';
      break;
    case 'succeeded':
      indicator.classList.add('status-success');
      indicator.querySelector('.status-text').textContent = 'Оплата успешна!';
      break;
    case 'failed':
      indicator.classList.add('status-failed');
      indicator.querySelector('.status-text').textContent = 'Оплата отклонена';
      break;
    case 'expired':
      indicator.classList.add('status-expired');
      indicator.querySelector('.status-text').textContent = 'Время истекло';
      break;
    default:
      indicator.querySelector('.status-text').textContent = `Статус: ${status}`;
  }
}

/**
 * Отрисовать успешную оплату
 */
function renderSuccess(container) {
  container.innerHTML = `
    <div class="paywall-result paywall-success">
      <div class="result-icon">✓</div>
      <h2>Оплата успешна!</h2>
      <p>Переход к результатам...</p>
    </div>
  `;
}

/**
 * Отрисовать неудачу
 */
function renderFailure(container, status) {
  const message = status === 'timeout' 
    ? 'Время ожидания оплаты истекло'
    : 'Платеж не прошёл';

  container.innerHTML = `
    <div class="paywall-result paywall-failure">
      <div class="result-icon">✗</div>
      <h2>${message}</h2>
      <p>Попробуйте снова или выберите другой способ оплаты</p>
    </div>
  `;
}

/**
 * Отрисовать отмену
 */
function renderCancelled(container) {
  container.innerHTML = `
    <div class="paywall-result paywall-cancelled">
      <div class="result-icon">⊘</div>
      <h2>Оплата отменена</h2>
      <p>Возврат к предыдущему экрану...</p>
    </div>
  `;
}

/**
 * Отрисовать ошибку
 */
function renderError(container, errorMessage) {
  container.innerHTML = `
    <div class="paywall-result paywall-error">
      <div class="result-icon">!</div>
      <h2>Произошла ошибка</h2>
      <p>${errorMessage}</p>
      <p class="error-help">Попробуйте повторить позже</p>
    </div>
  `;
}

/**
 * Форматирование суммы
 */
function formatAmount(kopeks) {
  const rubles = kopeks / 100;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
  }).format(rubles);
}

/**
 * Утилита sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
