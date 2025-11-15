# Промпт 4 Фронтенд диагностический поток

ЦЕЛЬ
Модернизировать фронтенд киоска: рефакторинг монолитного JS в модульную ESM структуру, сборка через Vite без реактивного фреймворка, Service Worker политика кеширования, изоляция dev-флага, обеспечение доступности WCAG AA, реализация paywall через blur фильтр, визуализация статусов устройств real-time, UI тесты Playwright. Без симуляций в PROD.

КОНТЕКСТ
Проект: автосервис самообслуживания, киоск в браузере или Electron. Текущий фронтенд: один index.html, встроенный JS, styles.css, service-worker.js. Экраны: attract, welcome (terms), services, thickness intro/flow, diagnostics connection/scanning/paywall/results, reports. Навигация showScreen(id). Проблемы: монолит JS, отсутствие модульности, dev-флаг в URL, недостаточная доступность, кеш SW при деплое. Вход: часть анализа 4, EQM_OBDWEB-main UI паттерны (опционально), animate.css-main анимации (доп ресурсы).

ГРАНИЦЫ
Фронтенд не знает о драйверах устройств, платёжных провайдерах, генерации отчётов. Он взаимодействует с агентом только через REST API и WebSocket. Фронтенд не хранит персональные данные (только sessionStorage/localStorage для состояния UI). Логика бизнес-правил на бэкенде. Фронтенд: презентация, навигация, UX.

АРХИТЕКТУРА

МОДУЛЬНАЯ ДЕКОМПОЗИЦИЯ apps/kiosk-frontend/src/
Разделение JS на модули ESM:
core/navigation.js: функции showScreen, hideScreen, навигация между экранами, история переходов.
core/api-client.js: обёртка fetch для REST API агента, методы post, get, обработка ошибок, retry.
core/device-status.js: подписка на WebSocket статусы устройств, обновление UI элементов data-атрибутов.
core/payment-client.js: запросы createIntent, getStatus, polling платежа.
core/session-manager.js: управление sessionStorage (sessionId, currentService, progress), авто-сброс по таймауту бездействия.
core/error-handler.js: глобальная обработка ошибок, модальные окна с сообщениями, retry логика.
screens/attract.js: логика экрана ожидания, триггер на касание/клик.
screens/welcome.js: согласие с условиями, чекбокс, переход на services.
screens/services.js: выбор услуги, карточки толщиномер/диагностика.
screens/diagnostics-connection.js: подключение OBD адаптера, вызов /api/obd/connect, отображение статуса.
screens/diagnostics-scanning.js: запуск сканирования /api/obd/scan, прогресс через WebSocket, визуализация.
screens/diagnostics-paywall.js: paywall blur фильтр, QR платежа, polling, разблюр после подтверждения.
screens/diagnostics-results.js: отображение DTC списка, интерпретация, кнопка Clear DTC с подтверждением.
utils/debounce.js, utils/formatters.js, utils/validators.js: вспомогательные утилиты.

VITE СБОРКА
Конфигурация apps/kiosk-frontend/vite.config.ts:
Build без реактивного фреймворка, только vanilla JS modules.
Entry point: src/main.js (инициализация модулей).
Output: dist/ с минификацией, tree-shaking, chunking.
Source maps для DEV, без source maps в PROD.
HTML plugin для index.html с инжектом скриптов.
CSS: импорт styles.css в main.js, PostCSS для autoprefixer.
Dev server: localhost:5173 с HMR.
Build command: vite build, preview: vite preview.
Package.json scripts: dev (vite), build (vite build), preview (vite preview), test (playwright test).

SERVICE WORKER ПОЛИТИКА apps/kiosk-frontend/public/service-worker.js
Стратегии кеширования:
Cache-first для статических ассетов (JS, CSS, images, fonts) с версионным хэшем в имени файла.
Network-first для API запросов /api/* (агент), fallback на кеш если оффлайн.
Stale-while-revalidate для HTML index.html: показать кешированный, параллельно обновить.
Инвалидация кеша: при изменении версии SW (version в начале файла), удаление старых кешей.
Регистрация SW в main.js: if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').
Обработка обновлений: уведомление пользователю (опционально) или автоматическая перезагрузка при новой версии.

DEV-ФЛАГ ИЗОЛЯЦИЯ
Убрать из URL параметра ?dev=1. Читать только из localStorage.devMode.
Активация: специальный жест, например, 3 пальца на экране в течение 5 секунд на attract screen, или комбинация клавиш Ctrl+Shift+D (если клавиатура доступна).
При активации: localStorage.setItem('devMode', 'true'), показать нотификацию "Dev mode enabled".
Кнопки "Пропустить" и другие dev-элементы: условный рендеринг if (localStorage.devMode === 'true').
PROD сборка: tree-shaking через Vite удаляет dev-код (обёрнутый в if (import.meta.env.DEV)).
Деактивация: localStorage.removeItem('devMode') через жест или авто-сброс при перезапуске приложения (опционально).

ДОСТУПНОСТЬ WCAG AA
Контрастность цветов: минимум 4.5:1 для текста, проверка через axe DevTools.
Размеры кнопок: минимум 44x44px touch target.
Focus states: видимые outline для всех интерактивных элементов, :focus-visible CSS.
ARIA labels: aria-label для иконок и кнопок без текста, role для кастомных виджетов.
Семантическая разметка: nav, main, section, article, button вместо div.
Навигация Tab: логический порядок tabindex, без tab-trap.
Клавиатура: все действия доступны без мыши (Enter для кнопок, Esc для модальных окон).
Screen reader: тестирование с NVDA/JAWS (опционально), alt для изображений.
Анимации: prefers-reduced-motion для отключения анимаций если пользователь предпочитает.
Проверка: axe-core npm пакет, автоматические тесты в Playwright.

PAYWALL
Экран diagnostics-paywall:
Container результатов: CSS filter blur(10px) до оплаты.
Модальное окно: QR код платежа, таймер 10 минут, статус "Ожидание оплаты...".
Polling: каждые 2 секунды GET /api/payments/status/:intentId до confirmed или expired.
При confirmed: снять blur, unlock результаты, переход на diagnostics-results.
При expired/failed: сообщение "Платёж не прошёл", кнопка "Повторить" или "Отменить".
Отмена: возврат на services экран.
UI элементы: QR изображение (base64 или SVG), прогресс-бар, кнопка "Я оплатил" (опционально, триггер для немедленной проверки).

СТАТУСЫ УСТРОЙСТВ
Компоненты визуализации:
Spinner (loading): CSS анимация rotation, SVG или Font Awesome icon.
Checkmark (success): зелёная галочка, анимация scale-in.
Error icon (failure): красный крестик или exclamation.
Progress bar: linear bar с процентом, обновление через WebSocket.
Текстовые статусы: "Подключение...", "Сканирование...", "Завершено", "Ошибка: {message}".
Обновление через device-status.js: подписка на WebSocket /ws/obd, на сообщения type status-update обновление data-атрибутов элементов (data-status, data-progress).
Пример: div data-device="obd" data-status="scanning" data-progress="50" → JS обновляет классы и текст.

ЭКРАНЫ ДЕТАЛИЗАЦИЯ

ATTRACT screens/attract.js
Логотип/бренд, слоган "Автосервис самообслуживания", анимация привлечения (опционально).
Триггер: click/touchstart на любом месте → showScreen('welcome').
Авто-сброс: если клиент бездействует на других экранах >2 минуты, возврат на attract.

WELCOME screens/welcome.js
Краткое приветствие, текст пользовательского соглашения (чтение из docs/legal/terms.md или inline).
Чекбокс: "Я согласен с условиями", disabled кнопка "Продолжить" до чека.
При клике "Продолжить": sessionStorage.setItem('termsAccepted', 'true'), showScreen('services').

SERVICES screens/services.js
Две карточки: "Толщиномер ЛКП" и "Диагностика OBD-II".
Описание выгоды, цены (350-400₽ толщиномер, 480₽ диагностика).
Клик на карточку: sessionStorage.setItem('selectedService', 'thickness' или 'diagnostics'), переход на соответствующий intro экран.

DIAGNOSTICS-CONNECTION screens/diagnostics-connection.js
Инструкция: "Вставьте OBD-II адаптер в разъём автомобиля".
Кнопка "Готово, подключить": вызов apiClient.post('/api/obd/connect').
Обработка ответа: 200 → showScreen('diagnostics-scanning'), 500 → error-handler модальное окно, retry.
Статус подключения: device-status обновление через WebSocket.

DIAGNOSTICS-SCANNING screens/diagnostics-scanning.js
Вызов apiClient.post('/api/obd/scan') → получение sessionId.
WebSocket подписка: deviceStatus.subscribe('obd', updateProgress).
Прогресс-бар: обновление data-progress.
Статусные сообщения: "Чтение кодов неисправностей...", "Опрос параметров...".
По завершении scan-complete: sessionStorage.setItem('scanSessionId', sessionId), showScreen('diagnostics-paywall').

DIAGNOSTICS-PAYWALL screens/diagnostics-paywall.js
Blur контейнера результатов.
Вызов paymentClient.createIntent({amount: 480, currency: 'RUB', service: 'diagnostics'}) → получение intentId, QR.
Отображение QR, таймер countdown 10 минут.
Polling: setInterval 2s paymentClient.getStatus(intentId).
При confirmed: clearInterval, unblur, showScreen('diagnostics-results').
При expired: clearInterval, сообщение "Время истекло", кнопка "Повторить" (новый интент) или "Отменить" (возврат на services).

DIAGNOSTICS-RESULTS screens/diagnostics-results.js
Запрос apiClient.get(`/api/obd/results/${sessionId}`).
Отображение DTC списка: таблица с кодами, категориями, описаниями.
Цветовая индикация: красный для critical, жёлтый для warning, зелёный для info.
Интерпретация: краткие рекомендации (если доступны в базе DTC).
Кнопка "Сбросить ошибки": confirmation модальное окно "Вы уверены? Это удалит все коды.", при подтверждении apiClient.post('/api/obd/clear-dtc', {confirm: true}).
Обработка ответа clearDtc: success → обновление UI "Ошибки сброшены", добавление в отчёт.
Кнопка "Получить отчёт": переход на reports экран (генерация и отправка email/SMS, детали в промпте 6).

UI ТЕСТЫ

PLAYWRIGHT apps/kiosk-frontend/tests/
Конфигурация playwright.config.ts: browsers [chromium, firefox, webkit], base URL localhost:5173 (dev) или dist (preview).
Тесты навигации tests/navigation.spec.ts: attract → welcome → services → diagnostics flow. Проверка showScreen, transitions.
Тесты paywall tests/paywall.spec.ts: mock payment API, проверка blur, QR отображение, polling, unblur при confirmed.
Тесты dev-флага tests/dev-flag.spec.ts: активация жеста, проверка кнопки "Пропустить" видна, деактивация.
Тесты статусов устройств tests/device-status.spec.ts: mock WebSocket, emit status-update, проверка UI обновления.
Тесты доступности tests/accessibility.spec.ts: axe-core проверка на каждом экране, контрасты, ARIA labels.
Тесты форм tests/forms.spec.ts: чекбокс согласия, кнопки disabled/enabled, валидация.
Snapshot тесты tests/snapshots.spec.ts: скриншоты ключевых экранов, сравнение с базовыми.
Производительность tests/performance.spec.ts: Lighthouse audit, score >90 для performance, accessibility, best-practices.

ЛОГИРОВАНИЕ
Минимальное клиентское логирование: только критичные ошибки.
Console.error для сбоев API, WebSocket disconnect, parse errors.
Отправка ошибок на агент: POST /api/logs {level, message, context, timestamp} (опционально).
В PROD: no console.log, только console.error.

МЕТРИКИ
Опционально: client-side метрики через API агента.
Время загрузки страницы, time to interactive, навигационные события.
Отправка через navigator.sendBeacon при unload.

КОНФИГУРАЦИЯ apps/kiosk-frontend/config.json
apiBaseUrl: localhost:3000, wsBaseUrl: ws localhost:3000, devMode: false, sessionTimeout: 120000, attractScreenTimeout: 5000.
Чтение конфига при старте main.js. В PROD: apiBaseUrl и wsBaseUrl из window.location.origin или ENV переменные через Vite define.

ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ

Пример 1: main.js инициализация
import { initNavigation } from './core/navigation.js';
import { initApiClient } from './core/api-client.js';
import { initDeviceStatus } from './core/device-status.js';
import { initSessionManager } from './core/session-manager.js';
import './styles.css';
initNavigation();
initApiClient(config.apiBaseUrl);
initDeviceStatus(config.wsBaseUrl);
initSessionManager(config.sessionTimeout);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js');

Пример 2: navigation.js
export function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.remove('hidden');
  sessionStorage.setItem('currentScreen', screenId);
}

Пример 3: api-client.js
export async function post(endpoint, body) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

Пример 4: device-status.js WebSocket
const ws = new WebSocket(wsBaseUrl + '/ws/obd');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'status-update') {
    updateDeviceUI('obd', msg.payload);
  }
};
function updateDeviceUI(device, payload) {
  const el = document.querySelector(`[data-device="${device}"]`);
  el.setAttribute('data-status', payload.status);
  el.setAttribute('data-progress', payload.progress);
  el.querySelector('.status-text').textContent = payload.message;
}

БЕЗОПАСНОСТЬ
CORS: агент настроен на разрешение localhost (DEV), домен киоска (PROD).
XSS защита: escape пользовательских вводов (если есть), использование textContent вместо innerHTML для динамических данных.
CSP (Content Security Policy): настройка в HTML meta или HTTP headers для запрета inline scripts (опционально, если нужна высокая безопасность).
Никаких секретов в клиентском коде: API ключи, токены только на бэкенде.

СТИЛИЗАЦИЯ
Использование существующего styles.css, расширение для новых компонентов.
BEM-подобная методология: .screen, .screen__header, .screen__button--primary.
Адаптивность: минимальная, т.к. киоск на фиксированном экране, но корректная работа на разных разрешениях.
Анимации: animate.css для входов/выходов экранов (fadeIn, slideIn), настройка через CSS классы.
Темная/светлая тема: опционально, по умолчанию светлая.

DEV РЕЖИМ ДЕТАЛИ
Кнопки "Пропустить": на экранах connection, scanning, paywall.
Пропустить connection: сразу showScreen('diagnostics-scanning') без вызова API.
Пропустить scanning: сразу showScreen('diagnostics-paywall') с mock sessionId.
Пропустить paywall: сразу unblur и showScreen('diagnostics-results') с mock данными.
Mock данные: фиксированные структуры (2 DTC кода, PID значения), без генерации псевдослучайных.

РИСКИ И МИТИГАЦИЯ
Риск: Service Worker кеш не обновляется. Митигация: версионирование SW, инвалидация старых кешей, уведомление пользователю.
Риск: WebSocket disconnect. Митигация: автоматическое переподключение с exponential backoff, fallback на polling если WS недоступен.
Риск: dev-флаг доступен клиентам. Митигация: активация только через скрытый жест, не документировать публично.
Риск: недоступность API агента. Митигация: retry с backoff, понятные сообщения об ошибке, fallback UI.
Риск: долгое сканирование блокирует UI. Митигация: async операции, прогресс-бар, возможность отмены.

ROADMAP РАСШИРЕНИЯ
Фаза 1: рефакторинг в модули ESM, Vite сборка, базовый поток диагностики.
Фаза 2: Service Worker политика, WCAG AA доступность, UI тесты Playwright.
Фаза 3: paywall интеграция, статусы устройств WebSocket, dev-флаг изоляция.
Фаза 4: толщиномер поток (аналогично диагностике), отчёты экран.

КРИТЕРИИ ACCEPTANCE
Код на ES6+ модули. Vite конфиг настроен. Сборка prod без ошибок. Service Worker регистрируется и кеширует корректно. Dev-флаг изолирован в localStorage. WCAG AA соблюдена (axe-core проверка проходит). Paywall blur/unblur работает. Статусы устройств обновляются real-time через WebSocket. UI тесты Playwright проходят. Snapshot тесты. Lighthouse score >90. Документация обновлена. Примеры работают. Без симуляций данных диагностики в PROD. DEV кнопки "Пропустить" скрыты в PROD. Линтеры проходят (ESLint). Commit message: feat(frontend): modular refactor with Vite, Service Worker, WCAG AA, paywall, device statuses.

ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ
Соблюдение инструкций проекта. Никаких эмодзи в коде. Code review: модули изолированы, async/await, явные ошибки, no console.log в PROD. Pre-commit: lint + test.

ИТОГ
По завершении полностью модернизированный фронтенд киоска: модульная ESM структура, Vite сборка, Service Worker кеширование, dev-флаг изолирован, WCAG AA доступность, paywall blur, real-time статусы устройств через WebSocket, UI тесты Playwright, Lighthouse >90, примеры, документация. Готов к интеграции с API агента из промптов 1-3 и платежами/отчётами из промптов 5-6. Код соответствует инструкциям проекта.
