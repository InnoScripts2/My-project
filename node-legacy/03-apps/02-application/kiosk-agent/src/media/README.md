# Media Optimization Module

Модуль оптимизации изображений для отчетов через imgproxy. Обеспечивает трансформацию, кеширование и автоматическую оптимизацию изображений для уменьшения размера PDF отчетов.

## Обзор

Модуль интегрирует imgproxy для:
- Уменьшения размера PDF отчетов (до 50-80% экономии)
- Ускорения генерации отчетов
- Экономии bandwidth при email доставке
- Единой точки управления медиа-ассетами

## Компоненты

### ImageProxyClient

Клиент для взаимодействия с imgproxy HTTP API.

Основные методы:
- `transformImage(sourceUrl, options)` - Трансформация изображения
- `buildProxyUrl(sourceUrl, options)` - Построение URL для imgproxy
- `getCachedImage(key)` - Получение из кеша
- `setCachedImage(key, buffer, ttl)` - Сохранение в кеш

### CacheManager

Управление кешированием трансформированных изображений.

Поддерживаемые backends:
- Memory cache (по умолчанию)
- Filesystem cache (через `CACHE_FILESYSTEM=true`)
- Redis cache (через `REDIS_URL`)

### ImgproxyConfig

Управление пресетами трансформаций.

Встроенные пресеты:
- `small` - 300x300, JPEG, quality 80
- `medium` - 800x600, JPEG, quality 85
- `large` - 1200x900, JPEG, quality 90
- `qr` - 200x200, PNG
- `logo` - 300px width, PNG

### ReportOptimizer

Автоматическая оптимизация изображений в HTML отчетах.

Возможности:
- Извлечение img tags и background-image
- Определение оптимальных параметров трансформации
- Конвертация data URIs
- Замена оптимизированными изображениями

## Настройка

### Переменные окружения

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

### imgproxy Setup

#### Docker

```yaml
services:
  imgproxy:
    image: darthsim/imgproxy:latest
    environment:
      IMGPROXY_KEY: your-hex-key
      IMGPROXY_SALT: your-hex-salt
      IMGPROXY_LOCAL_FILESYSTEM_ROOT: /images
    volumes:
      - ./images:/images:ro
    ports:
      - "8080:8080"
```

#### Генерация ключей

```bash
echo $(xxd -g 2 -l 64 -p /dev/random | tr -d '\n')
echo $(xxd -g 2 -l 64 -p /dev/random | tr -d '\n')
```

## Использование

### Автоматическая оптимизация в отчетах

Включается через переменную окружения `OPTIMIZE_IMAGES=true`. ReportService автоматически оптимизирует изображения перед генерацией PDF.

```typescript
// Автоматически работает в ReportService
const report = await reportService.generateReport(sessionId, type, data)
```

### Ручная трансформация

```typescript
import { imageProxyClient } from './media/ImageProxyClient.js'

const result = await imageProxyClient.transformImage('http://example.com/logo.png', {
  width: 300,
  format: 'png',
  quality: 85
})

console.log(`Size: ${result.size} bytes, cached: ${result.cachedFrom === 'cache'}`)
```

### Использование пресетов

```typescript
import { imgproxyConfig } from './media/ImgproxyConfig.js'
import { imageProxyClient } from './media/ImageProxyClient.js'

const logoOptions = imgproxyConfig.getPreset('logo')
const result = await imageProxyClient.transformImage('local://assets/logo.png', logoOptions)
```

### Оптимизация HTML

```typescript
import { reportOptimizer } from './media/ReportOptimizer.js'

const htmlContent = '<html><body><img src="data:image/png;base64,..."/></body></html>'
const optimized = await reportOptimizer.optimizeReportImages(htmlContent)

console.log(`Savings: ${optimized.savingsPercent}%, processed ${optimized.imagesProcessed} images`)
```

### Управление кешем

```typescript
import { cacheManager } from './media/CacheManager.js'

const stats = await cacheManager.getStats()
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`)

await cacheManager.clear()
```

## REST API

### POST /api/media/transform

Трансформация изображения.

Request:
```json
{
  "sourceUrl": "http://example.com/image.png",
  "options": {
    "width": 800,
    "height": 600,
    "format": "jpeg",
    "quality": 80
  }
}
```

Response (binary image or JSON с returnUrl=true):
```json
{
  "ok": true,
  "url": "http://imgproxy-server/...",
  "size": 102400,
  "contentType": "image/jpeg",
  "cachedFrom": "cache"
}
```

### GET /api/media/cache/stats

Статистика кеша.

Response:
```json
{
  "ok": true,
  "stats": {
    "totalKeys": 1500,
    "totalSize": 52428800,
    "hitRate": 0.85,
    "missRate": 0.15
  }
}
```

### DELETE /api/media/cache

Очистка кеша.

Response:
```json
{
  "ok": true,
  "cleared": true,
  "deletedKeys": 1500
}
```

### GET /api/media/presets

Список пресетов.

Response:
```json
{
  "ok": true,
  "presets": ["small", "medium", "large", "qr", "logo"]
}
```

## Метрики Prometheus

- `image_proxy_requests_total` - Количество запросов трансформации
- `image_proxy_transform_duration_seconds` - Длительность трансформации
- `image_proxy_cache_hit_rate` - Процент cache hits
- `image_proxy_cache_size_bytes` - Размер кеша
- `image_proxy_optimized_size_reduction_percent` - Процент уменьшения размера

## Безопасность

### imgproxy signature

В production обязательно настроить `IMGPROXY_KEY` и `IMGPROXY_SALT`. Insecure mode только для DEV.

```typescript
// Автоматически используется signature если ключи настроены
const url = client.buildProxyUrl(sourceUrl, options)
```

### Source images access

imgproxy должен иметь доступ только к whitelisted источникам. Блокировать SSRF атаки через URL validation.

### Cache poisoning

imageKey включает hash options для предотвращения конфликтов трансформаций.

## Производительность

### Cache backends

- **Memory**: Быстрый, но ограничен размером RAM
- **Filesystem**: Средняя скорость, персистентный
- **Redis**: Быстрый, персистентный, масштабируемый

### TTL настройка

По умолчанию 24 часа. Уменьшить для частых обновлений, увеличить для статичных ассетов.

### Мониторинг

Отслеживать:
- `image_proxy_cache_hit_rate` > 80%
- `image_proxy_cache_size_bytes` < MAX_CACHE_SIZE
- `image_proxy_transform_duration_seconds` < 2s

## Troubleshooting

### imgproxy недоступен

Проверить:
```bash
curl http://localhost:8080/health
```

Fallback: Отчеты генерируются с неоптимизированными images.

### Cache miss rate высокий

Проверить:
- TTL не слишком короткий
- Backend работает корректно
- Размер кеша достаточен

### Images не оптимизируются

Проверить:
- `OPTIMIZE_IMAGES=true` установлен
- imgproxy доступен
- Логи агента на наличие ошибок

## Примеры

### Кастомный пресет

```typescript
import { imgproxyConfig } from './media/ImgproxyConfig.js'

imgproxyConfig.addPreset('thumbnail', {
  width: 150,
  height: 150,
  format: 'webp',
  quality: 75,
  resize: 'crop'
})
```

### Интеграция с ReportService

```typescript
import { reportOptimizer } from './media/ReportOptimizer.js'

async function generateOptimizedReport(data) {
  let html = await renderTemplate(data)
  
  if (process.env.OPTIMIZE_IMAGES === 'true') {
    const optimized = await reportOptimizer.optimizeReportImages(html)
    html = optimized.htmlContent
  }
  
  return generatePdf(html)
}
```

## Тестирование

Запуск тестов:
```bash
npm test -- src/media/tests/*.test.ts
```

Тесты покрывают:
- Генерацию URL и signatures
- Кеширование и TTL
- Извлечение и замену изображений
- Пресеты и конфигурацию
