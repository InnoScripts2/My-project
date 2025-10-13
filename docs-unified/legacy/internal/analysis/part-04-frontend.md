# Анализ часть 4 фронтенд киоска

КОНТЕКСТ
Цель: стабилизировать экранные сценарии, статусы устройств, paywall и доступность. Вход: index.html, styles.css, service-worker.js, manifest.webmanifest.

ТЕКУЩАЯ СТРУКТУРА
Один HTML файл с встроенным JS. Экраны: attract, welcome (terms), services, thickness intro, thickness flow, diagnostics connection, scanning, paywall, results, reports. Навигация через showScreen(id). Статусы устройств через data-атрибуты. CSS в styles.css без препроцессора.

ПРОБЛЕМЫ
Монолит JS в одном файле: сложность поддержки. Отсутствие модульности: дублирование логики. Кеш SW: при Pages деплое старые версии могут оставаться. Dev-флаг не скрыт: dev=1 в URL доступен клиентам. Недостаточная доступность: контрасты, размеры кнопок, навигация с клавиатуры.

МОДУЛЬНАЯ ДЕКОМПОЗИЦИЯ
Разделить JS на модули ESM: navigation.js, api-client.js, device-status.js, payment-client.js, session-manager.js, error-handler.js, screens/*.js. Vite для сборки без реактивного фреймворка, только модульная структура. Минификация и tree-shaking. Source maps для отладки.

SERVICE WORKER ПОЛИТИКА
Cache-first для статических ассетов с версионным хэшем в имени. Network-first для API запросов. Stale-while-revalidate для HTML. При Pages деплое инвалидация через смену версии SW. Fallback для оффлайн.

DEV-ФЛАГ
Убрать из URL. Читать из localStorage с установкой только через специальный жест (например, 3 пальца 5 сек). Кнопки пропуска видны только если localStorage.devMode === true. PROD сборка полностью удаляет dev-код через tree-shaking.

ДОСТУПНОСТЬ
WCAG AA: контрастность 4.5:1, кнопки минимум 44x44px, focus states, ARIA labels, семантическая разметка, навигация Tab. Тестирование: axe-core, ручная проверка с клавиатурой, screen reader совместимость.

PAYWALL
Blur фильтр на контейнер результатов до оплаты. Модальное окно payment с QR и статусом. После подтверждения: unblur и unlock. Таймаут платежа 10 минут. Отмена: возврат к услугам.

СТАТУСЫ УСТРОЙСТВ
Визуальные индикаторы: spinner, checkmark, error icon, progress bar. Текстовые статусы: подключение, сканирование, завершено, ошибка. Обновление через WebSocket или polling API.

UI ТЕСТЫ
Playwright: навигация по всем экранам, paywall unlock, dev-флаг активация, статусы устройств, кнопки и формы. Snapshot тесты ключевых экранов. Производительность: Lighthouse score > 90.

КРИТЕРИИ ГОТОВНОСТИ
Модули ESM созданы, Vite конфиг готов, SW политика обновлена, dev-флаг изолирован, доступность проверена, UI тесты написаны, документация обновлена.
