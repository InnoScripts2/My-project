# Промпт 10 proxy и оптимизация медиа

ЦЕЛЬ
Реализовать imgproxy сервис для трансформации и оптимизации изображений логотипы QR коды в отчетах, кеширование результатов для минимизации повторной обработки, интеграция с промптом 6 ReportService для автоматической оптимизации PDF attachments, CDN-подобное поведение для статических ассетов, resize format conversion compression watermark опционально. Цель: уменьшение размера PDF отчетов, быстрая генерация отчетов, экономия bandwidth при email доставке, единая точка управления медиа ассетами.

КОНТЕКСТ
Промпт 6 ReportService генерирует HTML и PDF отчеты с встроенными изображениями логотипы base64 data URI, QR коды для share links, опционально screenshots диагностики. Проблемы: большие изображения увеличивают размер PDF 500KB становится 2MB, email delivery медленный и может fail на size limits, генерация PDF с Puppeteer медленная при больших images. Решение: imgproxy принимает URL исходного изображения или path, применяет трансформации resize width height, format conversion png to webp или jpeg, compression quality 80, watermark опционально, возвращает оптимизированное изображение. Кеш результатов в Redis или filesystem, повторные запросы отдаются из кеша мгновенно. ReportService использует imgproxy для всех images перед embed в PDF. Зависимости: промпт 6 ReportService вызывает ImageProxyClient для трансформации, промпт 7 monitoring метрики proxy requests cache hits, промпт 8 security доступ к proxy только локально или через auth.

ГРАНИЦЫ
Внутри: ImageProxyClient интеграция с imgproxy HTTP API, CacheManager для кеширования трансформированных images, расширение ReportService с методом optimizeImages, конфигурация трансформаций preset small medium large, REST API endpoint для ручной оптимизации images. Вне: imgproxy сервер deployment Docker или binary, source images хранилище S3 или local filesystem, CDN для публичного доступа к images, advanced watermarking с динамическими текстами. Интеграция: промпт 6 ReportService.generateReport вызывает ImageProxyClient перед Puppeteer PDF generation, промпт 7 метрики image_proxy_requests_total cache_hit_rate.

АРХИТЕКТУРА

МОДУЛЬ ImageProxyClient
Файл apps/kiosk-agent/src/media/ImageProxyClient.ts
Класс ImageProxyClient методы:

- transformImage sourceUrl string options TransformOptions returns Promise TransformResult
- getCachedImage imageKey string returns Promise Buffer or null
- setCachedImage imageKey string imageBuffer Buffer ttl number returns Promise void
- generateImageKey sourceUrl string options TransformOptions returns string
- buildProxyUrl sourceUrl string options TransformOptions returns string

TransformOptions interface:

- width number optional target width in pixels
- height number optional target height in pixels
- format png|jpeg|webp|avif optional output format
- quality number optional 1-100 compression quality default 80
- resize fit|fill|crop optional resize mode default fit
- background string optional hex color для fill режима например FFFFFF
- watermark object optional {text: string, position: string, opacity: number}

TransformResult interface:

- success boolean
- imageBuffer Buffer
- contentType string image/png image/jpeg etc
- size number bytes
- cachedFrom cache|proxy
- duration number ms

buildProxyUrl логика:

- imgproxy URL signature-based для security предотвращение abuse
- Формат: http://imgproxy-server/signature/width/height/gravity/resize/quality/format/sourceUrl
- Пример: http://localhost:8080/insecure/rs:fit:800:600/q:80/plain/http://source.com/image.png
- Если IMGPROXY_KEY и IMGPROXY_SALT настроены генерировать HMAC signature вместо insecure
- sourceUrl может быть local file path local://path/to/image.png или HTTP URL

transformImage процесс:

- Генерирует imageKey через generateImageKey sourceUrl + options hash SHA256
- Проверяет cache через getCachedImage imageKey
- Если cache hit возвращает cached buffer
- Если cache miss строит proxyUrl через buildProxyUrl
- Отправляет HTTP GET proxyUrl
- Получает image buffer
- Сохраняет в cache setCachedImage imageKey buffer ttl 86400 секунд 24 часа
- Возвращает TransformResult

МОДУЛЬ CacheManager
Файл apps/kiosk-agent/src/media/CacheManager.ts
Класс CacheManager методы:

- get key string returns Promise Buffer or null
- set key string value Buffer ttl number returns Promise void
- delete key string returns Promise void
- clear returns Promise void
- getStats returns Promise CacheStats

CacheStats interface:

- totalKeys number
- totalSize number bytes
- hitRate number percentage
- missRate number percentage

Backend опции:

- Filesystem cache: хранение в cache/images/key.bin файлы, TTL через mtime проверка
- Redis cache: если process.env.REDIS_URL настроен использовать Redis, бинарные данные в Redis Strings, TTL через EXPIRE
- Memory cache: если ни filesystem ни Redis простой Map in-memory с LRU eviction при превышении MAX_CACHE_SIZE

Выбор backend:

```typescript
if (process.env.REDIS_URL) {
  return new RedisCacheBackend(process.env.REDIS_URL);
} else if (process.env.CACHE_FILESYSTEM === 'true') {
  return new FilesystemCacheBackend('cache/images/');
} else {
  return new MemoryCacheBackend(100 * 1024 * 1024);
}
```

МОДУЛЬ ReportOptimizer
Файл apps/kiosk-agent/src/media/ReportOptimizer.ts
Класс ReportOptimizer методы:

- optimizeReportImages htmlContent string returns Promise OptimizedResult
- extractImages htmlContent string returns array ImageReference
- replaceImages htmlContent string replacements Map string string returns string

OptimizedResult interface:

- htmlContent string optimized HTML с updated image URLs или data URIs
- originalSize number bytes total size до оптимизации
- optimizedSize number bytes total size после оптимизации
- savingsPercent number percentage reduction
- imagesProcessed number count

ImageReference interface:

- tagType img|background
- originalSrc string
- elementIndex number
- attributes object

optimizeReportImages процесс:

- Парсит htmlContent через cheerio или jsdom, находит все img tags и background-image CSS
- Извлекает src URLs или data URIs
- Для каждого изображения:
  - Если data URI декодирует base64, сохраняет во временный файл
  - Определяет TransformOptions: для логотипов width 300, для QR codes width 200 format png, для screenshots width 800 format jpeg quality 80
  - Вызывает ImageProxyClient.transformImage
  - Получает optimized buffer, конвертирует обратно в data URI base64 или оставляет URL если proxy доступен публично
  - Заменяет src в HTML
- Возвращает OptimizedResult с новым HTML и статистикой

Интеграция с ReportService:

```typescript
// apps/kiosk-agent/src/reports/ReportService.ts
import { ReportOptimizer } from '../media/ReportOptimizer.js';

const optimizer = new ReportOptimizer();

async generateReport(sessionId: string, type: ReportType): Promise<Report> {
  let htmlContent = await this.renderTemplate(template, data);

  if (process.env.OPTIMIZE_IMAGES === 'true') {
    const optimized = await optimizer.optimizeReportImages(htmlContent);
    htmlContent = optimized.htmlContent;
    console.log(`Images optimized: ${optimized.savingsPercent}% reduction`);
  }

  const pdfPath = await this.generatePdf(htmlContent);
  return { reportId, htmlContent, pdfPath, ... };
}
```

МОДУЛЬ ImgproxyConfig
Файл apps/kiosk-agent/src/media/ImgproxyConfig.ts
Класс ImgproxyConfig методы:

- getPreset presetName small|medium|large|qr|logo returns TransformOptions
- addPreset presetName string options TransformOptions returns void
- listPresets returns array string

Preset определения:

```typescript
const presets: Record<string, TransformOptions> = {
  small: { width: 300, height: 300, format: 'jpeg', quality: 80, resize: 'fit' },
  medium: { width: 800, height: 600, format: 'jpeg', quality: 85, resize: 'fit' },
  large: { width: 1200, height: 900, format: 'jpeg', quality: 90, resize: 'fit' },
  qr: { width: 200, height: 200, format: 'png', resize: 'fit' },
  logo: { width: 300, format: 'png', resize: 'fit' }
};
```

REST API

POST /api/media/transform
Трансформация изображения через imgproxy
Запрос: application/json

```json
{
  "sourceUrl": "http://example.com/image.png",
  "options": {"width": 800, "height": 600, "format": "jpeg", "quality": 80}
}
```

Ответ: 200 OK image/jpeg binary или application/json если returnUrl true

```json
{
  "url": "http://imgproxy-server/signature/...",
  "size": 102400,
  "contentType": "image/jpeg",
  "cachedFrom": "cache"
}
```

GET /api/media/cache/stats
Статистика кеша
Ответ: 200 OK application/json

```json
{
  "totalKeys": 1500,
  "totalSize": 52428800,
  "hitRate": 0.85,
  "missRate": 0.15
}
```

DELETE /api/media/cache
Очистка кеша
Ответ: 200 OK application/json

```json
{
  "cleared": true,
  "deletedKeys": 1500
}
```

GET /api/media/presets
Список presets
Ответ: 200 OK application/json

```json
{
  "presets": ["small", "medium", "large", "qr", "logo"]
}
```

ТЕСТЫ

Юнит-тесты apps/kiosk-agent/src/media/tests/

- ImageProxyClient.test.ts: buildProxyUrl генерирует корректный URL с параметрами, transformImage возвращает buffer mock HTTP response, getCachedImage возвращает null если нет в cache, setCachedImage сохраняет в cache
- CacheManager.test.ts: set и get сохраняют и возвращают buffer, TTL expiration удаляет старые ключи, getStats возвращает hitRate и totalSize, clear очищает все ключи
- ReportOptimizer.test.ts: extractImages находит img tags и background-image CSS, replaceImages заменяет src на новые URLs, optimizeReportImages уменьшает size HTML, savingsPercent вычисляется правильно
- ImgproxyConfig.test.ts: getPreset возвращает preset options, addPreset добавляет custom preset, listPresets возвращает массив имен

Интеграционные тесты apps/kiosk-agent/src/media/tests/integration/

- imgproxy-integration.test.ts: запуск imgproxy в Docker, transformImage запрос к реальному imgproxy, проверка image buffer валидный JPEG или PNG, size меньше исходного, format соответствует запрошенному
- cache-performance.test.ts: transformImage первый запрос cache miss, второй запрос cache hit cachedFrom cache, duration второго запроса <10ms, cache stats hitRate увеличивается
- report-optimization.test.ts: генерация HTML отчета с большими images 5MB PNG, optimizeReportImages применение, проверка optimizedSize <1MB, PDF generation быстрее >50% improvement

E2E тесты apps/kiosk-agent/src/media/tests/e2e/

- full-report-with-optimization.test.ts: клиент проходит диагностику, отчет генерируется с логотипом и QR кодом, optimizeReportImages применяется, PDF размер <500KB, email delivery успешна <5 секунд, клиент получает отчет качество приемлемое
- cache-persistence.test.ts: трансформация 100 изображений, перезапуск агента, повторная трансформация тех же images все из cache duration <10ms каждый, cache stats hitRate 100%
- imgproxy-failure-handling.test.ts: imgproxy сервер недоступен, transformImage fallback к исходному image без оптимизации, отчет генерируется с original images, alert imgproxy_unavailable срабатывает, восстановление imgproxy следующие запросы оптимизируются

ДОКУМЕНТАЦИЯ

README apps/kiosk-agent/src/media/README.md
Секции:

- Обзор: зачем imgproxy оптимизация images размер PDF bandwidth
- imgproxy Setup: Docker deployment imgproxy/imgproxy image, конфигурация IMGPROXY_KEY IMGPROXY_SALT для security, source images хранилище
- Configuration: ENV переменные IMGPROXY_URL IMGPROXY_KEY IMGPROXY_SALT OPTIMIZE_IMAGES CACHE_BACKEND REDIS_URL
- Presets: список presets small medium large qr logo, как добавить custom preset
- Integration: как ReportService использует ReportOptimizer, automatic optimization vs manual
- Cache: backend опции filesystem Redis memory, TTL 24 hours, stats и clear
- API Usage: примеры POST transform GET cache stats DELETE cache
- Troubleshooting: imgproxy недоступен проверка connectivity, cache miss rate высокий проверка TTL и backend, images не оптимизируются проверка OPTIMIZE_IMAGES flag

ПРИМЕРЫ

Пример трансформация изображения

```typescript
// apps/kiosk-agent/src/media/image-transform-example.ts
import { ImageProxyClient } from './ImageProxyClient.js';

const client = new ImageProxyClient();

const result = await client.transformImage('http://example.com/logo.png', {
  width: 300,
  format: 'png',
  quality: 85
});

console.log(`Optimized image size: ${result.size} bytes, cached: ${result.cachedFrom === 'cache'}`);
```

Пример preset usage

```typescript
// apps/kiosk-agent/src/media/preset-example.ts
import { ImgproxyConfig } from './ImgproxyConfig.js';
import { ImageProxyClient } from './ImageProxyClient.js';

const config = new ImgproxyConfig();
const client = new ImageProxyClient();

const logoOptions = config.getPreset('logo');
const result = await client.transformImage('local://assets/logo.png', logoOptions);
```

Пример report optimization

```typescript
// apps/kiosk-agent/src/reports/report-with-optimization.ts
import { ReportOptimizer } from '../media/ReportOptimizer.js';

const optimizer = new ReportOptimizer();
let htmlContent = '<html><body><img src="data:image/png;base64,...large image..."/></body></html>';

const optimized = await optimizer.optimizeReportImages(htmlContent);

console.log(`Savings: ${optimized.savingsPercent}%, processed ${optimized.imagesProcessed} images`);
htmlContent = optimized.htmlContent;
```

Пример cache stats

```typescript
// apps/kiosk-agent/src/media/cache-stats-example.ts
import { CacheManager } from './CacheManager.js';

const cache = new CacheManager();

const stats = await cache.getStats();

console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(2)}%, total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
```

КОНФИГУРАЦИЯ

ENV переменные apps/kiosk-agent/.env

```env
IMGPROXY_URL=http://localhost:8080
IMGPROXY_KEY=hex-key-for-signature
IMGPROXY_SALT=hex-salt-for-signature
OPTIMIZE_IMAGES=true
CACHE_BACKEND=redis
REDIS_URL=redis://localhost:6379
CACHE_TTL=86400
MAX_CACHE_SIZE=104857600
```

imgproxy Docker deployment infra/docker-compose.yml

```yaml
services:
  imgproxy:
    image: darthsim/imgproxy:latest
    environment:
      IMGPROXY_KEY: hex-key
      IMGPROXY_SALT: hex-salt
      IMGPROXY_LOCAL_FILESYSTEM_ROOT: /images
    volumes:
      - ./images:/images:ro
    ports:
      - "8080:8080"
```

Redis cache configuration:

- TTL: 86400 секунд 24 часа для трансформированных images
- Maxmemory policy: allkeys-lru evict least recently used при достижении MAX_CACHE_SIZE
- Persistence: RDB snapshot каждые 15 минут optional для восстановления cache после перезапуска

БЕЗОПАСНОСТЬ

imgproxy signature: обязательно настроить IMGPROXY_KEY и IMGPROXY_SALT в prod, insecure mode только для DEV, signature предотвращает abuse генерация произвольных трансформаций
Source images access: imgproxy доступ только к whitelisted источникам local filesystem или trusted HTTP URLs, блокировать SSRF атаки через URL validation
Cache poisoning: imageKey включает hash options чтобы разные трансформации не перезаписывали друг друга, TTL ограничен чтобы не хранить устаревшие images бесконечно
API authentication: endpoints /api/media/ доступны только локально или через Bearer token если требуется remote access

МЕТРИКИ

image_proxy_requests_total counter labels status success|failure cached boolean: количество запросов трансформации
image_proxy_transform_duration_seconds histogram: длительность трансформации excluding cache hits
image_proxy_cache_hit_rate gauge: процент cache hits от total requests
image_proxy_cache_size_bytes gauge: текущий размер cache
image_proxy_optimized_size_reduction_percent histogram: процент уменьшения размера images

РИСКИ

imgproxy недоступен: трансформация fail, отчеты генерируются с неоптимизированными images. Решение: fallback к original images, alert imgproxy_unavailable, queue retry при восстановлении
Cache overflow: Redis maxmemory достигнут, eviction старых ключей. Решение: мониторинг cache_size_bytes, увеличить MAX_CACHE_SIZE или уменьшить TTL
Image quality degradation: слишком агрессивная compression портит качество. Решение: настройка quality параметров по preset, A/B тестирование оптимальных значений
Performance bottleneck: imgproxy одна инстанция не справляется с нагрузкой. Решение: horizontal scaling imgproxy за load balancer, cache hit rate >80% снижает нагрузку

ROADMAP

Фаза 1: ImageProxyClient базовая интеграция 1 неделя
Задачи: ImageProxyClient buildProxyUrl transformImage, CacheManager filesystem backend, юнит-тесты, интеграционные тесты с imgproxy Docker
Критерии: client трансформирует images через imgproxy, cache работает, тесты проходят

Фаза 2: ReportOptimizer и presets 1 неделя
Задачи: ReportOptimizer extractImages replaceImages optimizeReportImages, ImgproxyConfig presets, интеграция с ReportService generateReport, метрики и логирование
Критерии: отчеты автоматически оптимизируются если OPTIMIZE_IMAGES true, size reduction >50%, presets работают

Фаза 3: Advanced caching и продовая готовность 1 неделя
Задачи: Redis cache backend, cache stats API, DELETE cache endpoint, E2E тесты full report optimization cache persistence imgproxy failure, документация
Критерии: Redis cache работает, stats API возвращает hit rate, E2E тесты проходят, документация полная

КРИТЕРИИ ACCEPTANCE

1. ImageProxyClient трансформирует images через imgproxy с поддержкой width height format quality
2. CacheManager кеширует трансформированные images с TTL 24 часа и поддержкой Redis или filesystem
3. ReportOptimizer оптимизирует HTML images перед PDF generation
4. Интеграция с ReportService автоматическая оптимизация если OPTIMIZE_IMAGES true
5. ImgproxyConfig предоставляет presets small medium large qr logo
6. REST API endpoints transform cache-stats cache-clear доступны
7. Метрики image_proxy_* экспортируются в Prometheus
8. Юнит-тесты покрытие >80% для media модулей
9. Интеграционные тесты imgproxy-integration cache-performance report-optimization проходят
10. E2E тесты full-report-with-optimization cache-persistence imgproxy-failure-handling проходят

ИТОГ

Промпт 10 оптимизирует медиа ассеты в отчетах через imgproxy трансформация resize format conversion compression, кеширование результатов Redis или filesystem для мгновенного доступа, автоматическая интеграция с ReportService промпта 6 для уменьшения размера PDF >50%, ускорение email delivery, экономия bandwidth. Presets упрощают конфигурацию трансформаций для типичных use cases логотипы QR коды screenshots. Интеграция с промптами 6 7 8 обеспечивает seamless workflow генерация оптимизация мониторинг security.
