# Integration Guide

## Как интегрировать модульную архитектуру с существующим index.html

Существующий `index.html` содержит ~3200 строк inline JavaScript. Этот guide объясняет, как постепенно мигрировать на модульную архитектуру.

## Стратегия миграции

### Подход 1: Постепенная миграция (рекомендуется)

1. **Сохранить существующий index.html как index-legacy.html**
2. **Создать новый index.html с модульной загрузкой**
3. **Постепенно переносить функциональность экранов**

### Подход 2: Параллельная разработка

1. **Использовать index-minimal.html для новых экранов**
2. **Разработать screen модули параллельно**
3. **Переключиться разом после тестирования**

## Шаги интеграции

### Шаг 1: Создать screen модули

Создать файлы для каждого экрана в `src/screens/`:

```javascript
// src/screens/attract.js
import { showScreen } from '@core/navigation';
import { resetIdleTimer } from '@core/session-manager';

let attractInteractionArmed = false;
let attractArmTimer = null;

export function initAttractScreen() {
  const screen = document.getElementById('screen-attract');
  if (!screen) return;

  scheduleArming();
  
  ['click', 'pointerdown', 'touchstart', 'keydown'].forEach(eventName => {
    document.addEventListener(eventName, handleInteraction, { passive: true });
  });
}

function scheduleArming() {
  attractInteractionArmed = false;
  if (attractArmTimer) {
    clearTimeout(attractArmTimer);
  }
  attractArmTimer = setTimeout(() => {
    attractInteractionArmed = true;
  }, 600);
}

function handleInteraction() {
  if (!attractInteractionArmed) return;
  const attractScreen = document.getElementById('screen-attract');
  if (!attractScreen?.classList.contains('active')) return;
  
  attractInteractionArmed = false;
  showScreen('screen-welcome');
  resetIdleTimer();
}

// Export for cleanup
export function cleanupAttractScreen() {
  if (attractArmTimer) {
    clearTimeout(attractArmTimer);
    attractArmTimer = null;
  }
}
```

### Шаг 2: Обновить main.js для загрузки screen модулей

```javascript
// src/main.js
import '../styles.css';
import { loadConfig } from './core/config.js';
import { initNavigation } from './core/navigation.js';
import { initDeviceStatus } from './core/device-status.js';
import { initPaymentClient } from './core/payment-client.js';
import { initSessionManager } from './core/session-manager.js';
import { initErrorHandler } from './core/error-handler.js';
import { initDevMode } from './core/dev-mode.js';

// Import screen modules
import { initAttractScreen } from './screens/attract.js';
import { initWelcomeScreen } from './screens/welcome.js';
import { initServicesScreen } from './screens/services.js';

loadConfig();

// Initialize core
initErrorHandler();
initNavigation();
initDeviceStatus();
initPaymentClient();
initSessionManager();
initDevMode();

// Initialize screens
initAttractScreen();
initWelcomeScreen();
initServicesScreen();

// Prevent context menu and text selection
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('selectstart', (e) => e.preventDefault());

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(registration => {
        console.log('[SW] Service Worker registered:', registration.scope);
      })
      .catch(error => {
        console.error('[SW] Service Worker registration failed:', error);
      });
  });
}

console.log('[main] Kiosk frontend initialized');
```

### Шаг 3: Обновить index.html

Удалить inline `<script>` блок и заменить на:

```html
<!-- Load main module -->
<script type="module" src="/src/main.js"></script>
```

### Шаг 4: Обновить package.json scripts в root

Добавить в root `package.json`:

```json
{
  "scripts": {
    "frontend:dev": "npm --prefix apps/kiosk-frontend run dev",
    "frontend:build": "npm --prefix apps/kiosk-frontend run build",
    "frontend:test": "npm --prefix apps/kiosk-frontend test",
    "frontend:lint": "npm --prefix apps/kiosk-frontend run lint"
  }
}
```

### Шаг 5: Тестирование

```bash
# Запустить dev server
cd apps/kiosk-frontend
npm run dev

# Открыть http://localhost:5173

# Протестировать:
# 1. Attract screen interaction
# 2. Welcome screen terms checkbox
# 3. Services selection
# 4. Dev mode activation (Ctrl+Shift+D)
# 5. Idle timeout (wait 2 min)
```

## Пример миграции одного экрана

### До (inline JS в index.html):

```javascript
const welcomeAgree = document.getElementById('welcome-agree');
const welcomeContinue = document.getElementById('welcome-continue');

welcomeAgree?.addEventListener('change', () => {
  if (welcomeContinue) {
    welcomeContinue.disabled = !welcomeAgree.checked;
  }
});

welcomeContinue?.addEventListener('click', () => {
  show('screen-services');
});
```

### После (src/screens/welcome.js):

```javascript
import { showScreen } from '@core/navigation';
import { resetIdleTimer } from '@core/session-manager';

export function initWelcomeScreen() {
  const agreeCheckbox = document.getElementById('welcome-agree');
  const continueBtn = document.getElementById('welcome-continue');
  
  if (!agreeCheckbox || !continueBtn) {
    console.warn('[welcome] Elements not found');
    return;
  }
  
  updateContinueButton();
  
  agreeCheckbox.addEventListener('change', updateContinueButton);
  continueBtn.addEventListener('click', handleContinue);
  
  function updateContinueButton() {
    continueBtn.disabled = !agreeCheckbox.checked;
  }
  
  function handleContinue() {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('termsAccepted', 'true');
    }
    showScreen('screen-services');
    resetIdleTimer();
  }
}
```

## Обработка state между экранами

Использовать `session-manager.js`:

```javascript
import { getSessionState, setSessionValue } from '@core/session-manager';

// Получить state
const state = getSessionState();
console.log(state.selectedService); // 'diagnostics'

// Установить значение
setSessionValue('selectedService', 'thickness');
setSessionValue('contact.diagnostics', { 
  type: 'email', 
  normalized: 'user@example.com' 
});
```

## API взаимодействие

Использовать `api-client.js`:

```javascript
import { apiClient } from '@core/api-client';
import { showError } from '@core/error-handler';

async function startDiagnostics() {
  try {
    const result = await apiClient.post('/api/obd/scan', {
      port: selectedPort,
      mode: 'obd2'
    });
    
    console.log('Scan started:', result);
    return result;
  } catch (error) {
    showError('Не удалось начать сканирование', {
      onRetry: () => startDiagnostics()
    });
  }
}
```

## WebSocket интеграция

Использовать `device-status.js`:

```javascript
import { deviceStatus } from '@core/device-status';

// Подписаться на обновления
const unsubscribe = deviceStatus.subscribe((payload) => {
  console.log('Device status:', payload);
  
  if (payload.status === 'SCANNING') {
    updateProgressBar(payload.progress);
  }
  
  if (payload.status === 'RESULTS_READY') {
    showResults(payload.sessionId);
  }
});

// Отписаться при уходе с экрана
export function cleanupDiagnosticsScreen() {
  unsubscribe();
}
```

## Paywall реализация

```javascript
import { createPaymentIntent, startPaymentPolling } from '@core/payment-client';
import { showScreen } from '@core/navigation';

export async function showPaywall() {
  const resultsContainer = document.getElementById('obd-results');
  const paywallOverlay = document.getElementById('paywall-overlay');
  
  // Добавить blur
  resultsContainer.classList.add('paywall-blurred');
  paywallOverlay.classList.remove('hidden');
  
  // Создать intent
  const intent = await createPaymentIntent(480, {
    service: 'diagnostics',
    sessionId: getSessionState().session.obdId
  });
  
  // Показать QR
  displayQR(intent.qrText);
  
  // Начать polling
  const stopPolling = startPaymentPolling(intent.id, (status) => {
    if (status.status === 'succeeded') {
      // Убрать blur
      resultsContainer.classList.remove('paywall-blurred');
      paywallOverlay.classList.add('hidden');
      stopPolling();
      showScreen('screen-obd-results');
    }
  });
}
```

## Dev mode использование

```javascript
import { isDevMode } from '@core/dev-mode';

export function initDiagnosticsScreen() {
  const skipButton = document.getElementById('obd-skip');
  
  if (skipButton) {
    // Показать только в dev mode
    skipButton.style.display = isDevMode() ? '' : 'none';
    skipButton.setAttribute('data-dev-only', '');
    
    skipButton.addEventListener('click', () => {
      if (isDevMode()) {
        // Пропустить сканирование в DEV
        showScreen('screen-obd-results');
      }
    });
  }
}
```

## Контрольный список миграции

### Подготовка
- [ ] Создать резервную копию index.html
- [ ] Установить зависимости: `cd apps/kiosk-frontend && npm install`
- [ ] Протестировать build: `npm run build`

### Миграция core функциональности
- [ ] Перенести конфигурационные переменные в config.js
- [ ] Перенести API вызовы на api-client.js
- [ ] Перенести WebSocket логику на device-status.js
- [ ] Перенести платёжную логику на payment-client.js

### Миграция экранов
- [ ] Создать src/screens/attract.js
- [ ] Создать src/screens/welcome.js
- [ ] Создать src/screens/services.js
- [ ] Создать src/screens/diagnostics-*.js
- [ ] Создать src/screens/thickness-*.js

### Тестирование
- [ ] Запустить dev server
- [ ] Протестировать каждый экран
- [ ] Запустить Playwright тесты
- [ ] Проверить accessibility
- [ ] Проверить dev mode

### Финализация
- [ ] Обновить root package.json scripts
- [ ] Обновить документацию
- [ ] Code review
- [ ] Деплой

## Troubleshooting

### Module not found
```
Error: Cannot find module '@core/navigation'
```

**Solution**: Проверить Vite alias в vite.config.js:
```javascript
resolve: {
  alias: {
    '@core': path.resolve(__dirname, './src/core'),
  },
}
```

### Service Worker не обновляется

**Solution**: 
1. Инкрементировать VERSION в service-worker.js
2. Hard reload (Ctrl+Shift+R)
3. Unregister SW в DevTools

### WebSocket не подключается

**Solution**:
1. Проверить, что agent запущен
2. Проверить wsBaseUrl в config
3. Проверить CORS на backend

## Дополнительные ресурсы

- [Vite Documentation](https://vitejs.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
