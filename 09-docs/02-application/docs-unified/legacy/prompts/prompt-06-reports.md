# Промпт 6 Отчёты и доставка

ЦЕЛЬ
Реализовать систему генерации отчётов в HTML/PDF форматах, предпросмотр в UI, доставку через email/SMS, краткосрочное хранение (24 часа), очистку, метрики, тесты. Отчёты для двух услуг: толщиномер ЛКП и диагностика OBD-II. Минимальные поля без избыточности. Без хранения персональных данных долгосрочно.

КОНТЕКСТ
Проект: автосервис самообслуживания. После завершения услуги (измерения толщиномером или сканирования OBD) клиент получает отчёт: предпросмотр в UI, опционально отправка на email/SMS. Вход: часть анализа 6, интеграция с сессиями из промптов 2-3, фронтендом из промпта 4.

ГРАНИЦЫ
Модуль отчётов не знает о драйверах устройств, платежах, UI деталях. Он предоставляет интерфейс ReportService для генерации HTML/PDF отчётов, предпросмотра, отправки. Верхний слой Application использует ReportService после завершения сессии и подтверждения оплаты. Не хранит персональные данные клиентов долгосрочно (только контакты для доставки, удаляются через 24 часа).

АРХИТЕКТУРА

МОДУЛЬ apps/kiosk-agent/src/reports/ReportService.ts
Интерфейс ReportService: generateReport(sessionId: string, type: ReportType) Promise Report, getReport(reportId: string) Promise Report optional, sendReport(reportId: string, delivery: DeliveryOptions) Promise DeliveryResult, previewReport(reportId: string) Promise string (HTML). ReportType enum: THICKNESS, DIAGNOSTICS. Report: reportId string UUID, sessionId string, type ReportType, generatedAt timestamp, htmlContent string, pdfPath string optional, metadata object. DeliveryOptions: channel enum (EMAIL, SMS), recipient string (email or phone), language string default ru. DeliveryResult: success boolean, channel, recipient, sentAt timestamp, error string optional.

HTML ШАБЛОНЫ apps/kiosk-agent/src/reports/templates/
Handlebars шаблоны: report-thickness.hbs, report-diagnostics.hbs. Структура: HTML5 doctype, head с inline CSS (для email совместимости), body с контейнером отчёта. Inline CSS: стили таблиц, цветовые коды (зелёный для нормы, жёлтый для отклонений, красный для критичных), шрифты sans-serif, адаптивность для мобильных (media queries). Handlebars helpers: formatDate, formatNumber, colorCode (значение → класс CSS). Partials: header.hbs (логотип, дата), footer.hbs (контакты, QR для повторного доступа опционально).

МИНИМАЛЬНЫЕ ПОЛЯ
Толщиномер report-thickness.hbs: дата услуги, время, тип автомобиля optional (если клиент ввёл), таблица измерений (зона кузова, значение микрон, норма 80-150, статус нормальное/отклонение), средние значения по зонам, общая интерпретация (например, "85% точек в норме, 15% отклонений"). Без: город, СТО, имя мастера, VIN (если не критично).
Диагностика report-diagnostics.hbs: дата услуги, время, марка автомобиля optional (если определена через VIN запрос 09 02), таблица DTC (код, категория P/C/B/U, описание, рекомендация), статусы систем (двигатель, трансмиссия, тормоза по категориям кодов), результат сброса DTC (если выполнялся): "Ошибки сброшены" или "Ошибки не сброшены", общие рекомендации (например, "Обнаружено 2 кода двигателя, рекомендуется диагностика на СТО"). Без: город, СТО, имя мастера, номер автомобиля.

PDF ГЕНЕРАЦИЯ apps/kiosk-agent/src/reports/PdfGenerator.ts
Puppeteer: npm puppeteer, запуск headless браузера, рендер HTML в PDF. Метод generatePdf(htmlContent: string) Promise Buffer. Настройки: формат A4, ориентация portrait, margins 10mm, header/footer через headerTemplate/footerTemplate (логотип, дата, номер страницы, контакты). Embed изображений: конвертация внешних URL изображений в base64 data URI для offline PDF. Альтернатива (если Puppeteer слишком тяжёлый): pdfkit или jsPDF (но менее гибкие для сложных HTML). Cleanup: закрытие браузера после генерации, управление ресурсами. В DEV: Puppeteer может не запускаться если нет Chrome, fallback на mock PDF (текстовый файл или пустой Buffer).

ПРЕДПРОСМОТР apps/kiosk-agent/src/routes/reports.ts
GET /api/reports/:reportId/preview: вызов reportService.previewReport(reportId). Возврат HTML с Content-Type text/html. Фронтенд отображает в iframe или новом окне. Без сохранения на долгий срок: предпросмотр генерируется on-the-fly из сохранённого HTML контента. Если reportId не найден: 404.

EMAIL ДОСТАВКА apps/kiosk-agent/src/reports/delivery/EmailService.ts
Адаптер EmailService: методы sendEmail(to: string, subject: string, body: string, attachments: Attachment array) Promise boolean. Реализации: SmtpEmailService (nodemailer с SMTP сервером), SendGridEmailService (SendGrid API). Конфигурация: SMTP host/port/user/password из ENV, или SendGrid API key. Attachment: filename, content Buffer (PDF), contentType application/pdf. Retry: 3 попытки с exponential backoff 2s → 4s → 8s при сетевых ошибках. Логирование успеха/неудачи. Валидация email: regex проверка формата, отклонение невалидных. Rate limiting: макс 10 отправок за час от одного киоска (защита от спама). Body: HTML email с отчётом inline (для предпросмотра в почте) и PDF как attachment. Subject: "Отчёт по диагностике OBD-II" или "Отчёт толщиномера ЛКП" + дата.

SMS ДОСТАВКА apps/kiosk-agent/src/reports/delivery/SmsService.ts
Адаптер SmsService: методы sendSms(to: string, body: string) Promise boolean. Реализации: TwilioSmsService (Twilio API), другие (Смс.ру, Мегафон API). Конфигурация: Twilio accountSid, authToken, fromNumber из ENV. Body: краткое сообщение "Ваш отчёт готов. Ссылка для скачивания: [URL]" (если есть публичный URL отчёта) или "Отчёт сохранён на терминале, распечатайте или запросите по email". Макс длина 160 символов. Retry: 3 попытки. Валидация phone: формат +7XXXXXXXXXX или международный. Rate limiting: макс 10 SMS за час.

ХРАНИЛИЩЕ ОТЧЁТОВ apps/kiosk-agent/src/reports/ReportStore.ts
Локальное хранение: файловая система или SQLite. Файловая система: директория reports/ с подпапками по дате YYYY-MM-DD/reportId.html и reportId.pdf. SQLite: таблица reports с полями reportId, sessionId, type, htmlContent text, pdfPath string, generatedAt, expiresAt, metadata json. TTL 24 часа: поле expiresAt = generatedAt + 24h. Cleanup: cron задача каждые 1 час, удаление отчётов где expiresAt < Date.now(). Методы: save(report), get(reportId), delete(reportId), cleanup(). Персональные данные: только контакты доставки в metadata, без номеров автомобилей, паспортов и т.д. Шифрование в покое optional (если требуется высокая безопасность): encrypt HTML/PDF перед сохранением.

REST API apps/kiosk-agent/src/routes/reports.ts
POST /api/reports/generate: body sessionId, type (THICKNESS/DIAGNOSTICS). Вызов reportService.generateReport. Возврат 201 Created Report (reportId, htmlContent, pdfPath optional) или 400/500. GET /api/reports/:reportId/preview: возврат HTML. GET /api/reports/:reportId/download: возврат PDF с Content-Type application/pdf, Content-Disposition attachment filename отчёт-дата.pdf. POST /api/reports/:reportId/send: body channel (EMAIL/SMS), recipient. Вызов reportService.sendReport. Возврат 200 DeliveryResult или 400/500. Middleware: auth опционально, request logger, error handler.

МЕТРИКИ PROMETHEUS apps/kiosk-agent/src/reports/metrics.ts
prom-client: report_generated_total counter labels type (THICKNESS, DIAGNOSTICS), status (success, failed). report_delivered_total counter labels channel (EMAIL, SMS), status (success, failed). report_generation_duration_seconds histogram labels type. Экспорт через /metrics. Алерты: report_delivery_failures = rate(report_delivered_total{status="failed"}) > 5 за час → нотификация.

ФРОНТЕНД ИНТЕГРААЦИЯ apps/kiosk-frontend/src/screens/reports.js
Экран reports: после завершения услуги (diagnostics-results или thickness-results) кнопка "Получить отчёт". Клик: POST api/reports/generate sessionId type → получение reportId. Отображение опций: "Предпросмотр" (iframe api/reports/:reportId/preview), "Скачать PDF" (ссылка api/reports/:reportId/download), "Отправить на email" (форма ввод email → POST api/reports/:reportId/send channel EMAIL recipient), "Отправить SMS" (форма ввод телефон → POST api/reports/:reportId/send channel SMS recipient). Обработка ответов: success → сообщение "Отчёт отправлен на email", failed → сообщение "Ошибка отправки. Повторить?". Валидация email/phone на клиенте перед отправкой.

КОНФИГУРАЦИЯ apps/kiosk-agent/config/reports.json
templatesDir ./src/reports/templates, reportsDir ./reports (для хранения файлов), ttl 86400000 (24 часа), emailProvider SMTP или SendGrid, smsProvider Twilio, smtpHost ENV, smtpPort ENV, smtpUser ENV, smtpPass ENV, sendGridApiKey ENV, twilioAccountSid ENV, twilioAuthToken ENV, twilioFromNumber ENV. Чтение конфига при старте. Валидация обязательных полей.

ТЕСТЫ

ЮНИТ apps/kiosk-agent/src/reports/tests/ReportService.test.ts
Mock сессий (из промптов 2-3). Тест generateReport THICKNESS: mock session данные толщиномера → generateReport → проверка htmlContent содержит таблицу измерений, средние, интерпретацию. Тест generateReport DIAGNOSTICS: mock session DTC → htmlContent содержит коды, описания, рекомендации. Тест getReport: save report → get по reportId → проверка данных. Тест TTL: save report, mock Date.now() + 25 часов → cleanup → проверка удаления.

ЮНИТ apps/kiosk-agent/src/reports/tests/PdfGenerator.test.ts
Mock Puppeteer. Тест generatePdf: HTML input → mock page.pdf() → проверка возврата Buffer. Тест embed images: HTML с img src URL → проверка конвертация в data URI. Тест cleanup: проверка browser.close() вызван.

ЮНИТ apps/kiosk-agent/src/reports/delivery/tests/EmailService.test.ts
Mock nodemailer или axios (SendGrid). Тест sendEmail: valid email, HTML body, PDF attachment → mock transport.sendMail → success true. Тест retry: mock network error → retry 3 раза → success или failed. Тест валидация: invalid email format → reject. Тест rate limiting: 11 emails за час → 11-я отклонена.

ЮНИТ apps/kiosk-agent/src/reports/delivery/tests/SmsService.test.ts
Mock Twilio API. Тест sendSms: valid phone, body → mock API call → success. Тест retry: network error → retry. Тест валидация: invalid phone → reject. Тест длина: body >160 символов → truncate или reject.

ИНТЕГРАЦИЯ apps/kiosk-agent/src/reports/tests/integration-api.test.ts
Поднятие агента, mock сессии. Последовательность: POST api/reports/generate sessionId type DIAGNOSTICS → 201 reportId, GET api/reports/:reportId/preview → 200 HTML, GET api/reports/:reportId/download → 200 PDF, POST api/reports/:reportId/send channel EMAIL recipient mock address → 200 success. Проверка всех эндпойнтов.

E2E apps/kiosk-agent/src/reports/tests/e2e-reports.test.ts
Полный поток с фронтендом. Сценарий: завершение диагностики → кнопка "Получить отчёт" → генерация → предпросмотр в iframe → ввод email → отправка → проверка сообщения успеха. Проверка UI, API, метрик.

ДОКУМЕНТАЦИЯ apps/kiosk-agent/src/reports/README.md
Описание архитектуры отчётов, типы отчётов, шаблоны Handlebars, генерация PDF, доставка email/SMS, хранение и TTL, API эндпойнты, примеры интеграции, troubleshooting. Диаграмма последовательности: session complete → generateReport → save → preview/download/send.

ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ

Пример 1: генерация отчёта
import { ReportService } from './reports/ReportService.js';
const reportService = new ReportService(config);
const report = await reportService.generateReport('sessionId123', ReportType.DIAGNOSTICS);
console.log('Report ID:', report.reportId, 'HTML length:', report.htmlContent.length);

Пример 2: предпросмотр
const htmlPreview = await reportService.previewReport(report.reportId);
// Возврат клиенту для отображения в iframe

Пример 3: отправка на email
const deliveryResult = await reportService.sendReport(report.reportId, {
  channel: DeliveryChannel.EMAIL,
  recipient: 'client at example.com',
  language: 'ru'
});
if (deliveryResult.success) {
  console.log('Email sent to', deliveryResult.recipient);
} else {
  console.error('Email failed:', deliveryResult.error);
}

Пример 4: фронтенд интеграция (из промпта 4 детализация)
async function getReport(sessionId, type) {
  const report = await apiClient.post('/api/reports/generate', { sessionId, type });
  showPreview(report.reportId);
  const email = await promptEmail();
  if (email) {
    await apiClient.post(`/api/reports/${report.reportId}/send`, { channel: 'EMAIL', recipient: email });
    showMessage('Отчёт отправлен на ' + email);
  }
}

ИНТЕГРАЦИЯ С APPLICATION LAYER
Application слой слушает событие scan-complete или measurement-complete. После подтверждения оплаты: вызов reportService.generateReport(sessionId, type). Сохранение reportId в сессии. Переход фронтенда на экран reports с reportId.

БЕЗОПАСНОСТЬ
Секреты email/SMS: SMTP credentials, SendGrid API key, Twilio tokens в ENV. HTTPS обязателен для webhook и API. PII минимум: только контакты для доставки, удаляются через 24 часа. Маскирование в логах: email e***@***.com, phone +7***1234. Валидация вводов: email regex, phone format, предотвращение injection. Rate limiting: защита от спама. Audit trail: логирование всех операций generateReport, sendReport с timestamp, reportId, recipient, result.

ОШИБКИ
Кастомные классы: ReportGenerationError, ReportDeliveryError. Все extends Error. Поля: message, code, reportId, details. Коды: REPORT_GENERATION_FAILED, REPORT_DELIVERY_FAILED, REPORT_NOT_FOUND, INVALID_RECIPIENT. Возврат клиенту: понятные сообщения "Не удалось сгенерировать отчёт. Попробуйте позже." или "Email адрес некорректен".

РИСКИ И МИТИГАЦИЯ
Риск: Puppeteer не запускается (отсутствие Chrome на киоске). Митигация: проверка при старте агента, fallback на mock PDF в DEV, требование Chrome в PROD setup. Риск: SMTP/SMS сервисы недоступны. Митигация: retry с backoff, алерты на высокий процент failed, fallback UI сообщение "Отчёт сохранён локально, скачайте PDF". Риск: спам через email/SMS. Митигация: rate limiting, валидация, опциональная капча (если доступна). Риск: PII утечка в отчётах. Митигация: минимизация полей, TTL 24 часа, шифрование опционально. Риск: неверный формат PDF (не открывается). Митигация: тесты рендера, проверка embed images, fallback на HTML email.

ROADMAP РАСШИРЕНИЯ
Фаза 1: HTML шаблоны, генерация отчётов, предпросмотр. Фаза 2: PDF через Puppeteer, доставка email. Фаза 3: SMS доставка, TTL и cleanup. Фаза 4: расширенные шаблоны (графики, диаграммы), multi-language (en, ru), кастомизация брендинга.

КРИТЕРИИ ACCEPTANCE
Интерфейс ReportService реализован. Шаблоны Handlebars для THICKNESS и DIAGNOSTICS созданы. PDF генерация через Puppeteer работает. Email доставка (SMTP или SendGrid) настроена. SMS доставка (Twilio) настроена. Предпросмотр HTML в UI. Хранилище с TTL 24 часа и cleanup. Метрики Prometheus и алерты. Тесты юнит/интеграция/E2E проходят. Документация и примеры созданы. Фронтенд интеграция из промпта 4. Без долгосрочного хранения PII. Секреты в ENV. Код на TypeScript ESM strict. Линтеры проходят. Commit message: feat(reports): add HTML/PDF generation, email/SMS delivery, preview, TTL storage, cleanup.

ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ
Соблюдение инструкций проекта. Никаких эмодзи. Code review: explicit errors, async/await, no console.log в PROD, валидация вводов, security best practices. Pre-commit: lint + test.

ИТОГ
По завершении полностью функциональная система отчётов: генерация HTML/PDF из Handlebars шаблонов, предпросмотр в UI, доставка через email/SMS с retry, краткосрочное хранение 24 часа с автоматической очисткой, метрики, тесты, документация, примеры. Интеграция с сессиями из промптов 2-3 и фронтендом из промпта 4. Минимальные поля без избыточности. Готовность к продакшну. Код соответствует инструкциям проекта.
