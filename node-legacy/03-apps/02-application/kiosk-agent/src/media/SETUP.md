# imgproxy Setup Guide

Руководство по настройке imgproxy для оптимизации изображений в отчетах.

## Требования

- Docker и Docker Compose (рекомендуется)
- или imgproxy binary для нативной установки
- Redis (опционально, для кеширования)

## Быстрый старт с Docker

### 1. Генерация ключей безопасности

```bash
# Генерация IMGPROXY_KEY
xxd -g 2 -l 64 -p /dev/random | tr -d '\n'

# Генерация IMGPROXY_SALT
xxd -g 2 -l 64 -p /dev/random | tr -d '\n'
```

Сохраните эти значения - они потребуются для настройки.

### 2. Создание директории для изображений

```bash
mkdir -p images
```

### 3. Настройка переменных окружения

Создайте файл `.env` в директории `kiosk-agent`:

```env
IMGPROXY_KEY=your-generated-key-here
IMGPROXY_SALT=your-generated-salt-here
```

### 4. Запуск сервисов

```bash
docker-compose -f docker-compose.imgproxy.yml up -d
```

Это запустит:
- imgproxy на порту 8080
- Redis на порту 6379

### 5. Проверка работоспособности

```bash
# Проверка imgproxy
curl http://localhost:8080/health

# Проверка Redis
redis-cli ping
```

### 6. Настройка kiosk-agent

Обновите `.env.prod` или создайте `.env`:

```env
IMGPROXY_URL=http://localhost:8080
IMGPROXY_KEY=your-generated-key-here
IMGPROXY_SALT=your-generated-salt-here
OPTIMIZE_IMAGES=true
CACHE_BACKEND=redis
REDIS_URL=redis://localhost:6379
CACHE_TTL=86400
MAX_CACHE_SIZE=104857600
```

## Продакшн развертывание

### Безопасность

1. **Обязательно** установите `IMGPROXY_KEY` и `IMGPROXY_SALT`
2. Никогда не используйте `insecure` режим в продакшне
3. Ограничьте доступ к imgproxy через firewall
4. Используйте HTTPS для публичного доступа

### Производительность

#### imgproxy настройки

```yaml
environment:
  IMGPROXY_WORKERS: 8                    # Количество воркеров
  IMGPROXY_MAX_SRC_RESOLUTION: 50.0     # Максимальное разрешение (мегапиксели)
  IMGPROXY_MAX_SRC_FILE_SIZE: 10485760  # Максимальный размер файла (10MB)
  IMGPROXY_DOWNLOAD_TIMEOUT: 10         # Таймаут загрузки (секунды)
```

#### Redis настройки

```yaml
command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
```

### Мониторинг

#### Метрики imgproxy

imgproxy предоставляет Prometheus метрики на `/metrics`:

```bash
curl http://localhost:8080/metrics
```

#### Метрики кеша

Агент экспортирует следующие метрики:

- `image_proxy_requests_total` - Количество запросов
- `image_proxy_cache_hit_rate` - Процент попаданий в кеш
- `image_proxy_cache_size_bytes` - Размер кеша
- `image_proxy_transform_duration_seconds` - Длительность трансформации

#### Алерты

Рекомендуемые алерты:

```yaml
- alert: ImgproxyDown
  expr: up{job="imgproxy"} == 0
  for: 5m

- alert: LowCacheHitRate
  expr: image_proxy_cache_hit_rate < 0.5
  for: 15m

- alert: HighTransformDuration
  expr: image_proxy_transform_duration_seconds > 2
  for: 10m
```

## Нативная установка (без Docker)

### Linux

```bash
# Скачать imgproxy binary
wget https://github.com/imgproxy/imgproxy/releases/download/v3.21.0/imgproxy_Linux_x86_64.tar.gz

# Распаковать
tar -xzf imgproxy_Linux_x86_64.tar.gz

# Переместить в системную директорию
sudo mv imgproxy /usr/local/bin/

# Создать systemd сервис
sudo nano /etc/systemd/system/imgproxy.service
```

Содержимое `imgproxy.service`:

```ini
[Unit]
Description=imgproxy Image Resizing Server
After=network.target

[Service]
Type=simple
User=imgproxy
Environment="IMGPROXY_KEY=your-key"
Environment="IMGPROXY_SALT=your-salt"
Environment="IMGPROXY_LOCAL_FILESYSTEM_ROOT=/opt/images"
Environment="IMGPROXY_BIND=:8080"
ExecStart=/usr/local/bin/imgproxy
Restart=always

[Install]
WantedBy=multi-user.target
```

Запуск:

```bash
sudo systemctl daemon-reload
sudo systemctl enable imgproxy
sudo systemctl start imgproxy
sudo systemctl status imgproxy
```

### Windows

1. Скачать `imgproxy_Windows_x86_64.zip` с releases page
2. Распаковать в `C:\Program Files\imgproxy\`
3. Создать `.env` файл с настройками
4. Запустить через PowerShell или создать Windows Service

## Тестирование

### Проверка трансформации

```bash
# Простая трансформация
curl "http://localhost:8080/insecure/rs:fit:300:300/plain/http://example.com/image.png" -o test.png

# С качеством
curl "http://localhost:8080/insecure/rs:fit:300:300/q:80/plain/http://example.com/image.png" -o test.png
```

### Проверка API агента

```bash
# Трансформация через API
curl -X POST http://localhost:7070/api/media/transform \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "http://example.com/logo.png",
    "options": {"width": 300, "format": "png"}
  }' -o optimized.png

# Статистика кеша
curl http://localhost:7070/api/media/cache/stats

# Список пресетов
curl http://localhost:7070/api/media/presets
```

### Запуск unit тестов

```bash
cd 03-apps/02-application/kiosk-agent
npm test -- src/media/tests/*.test.ts
```

### Запуск интеграционных тестов

```bash
npm test -- src/media/tests/integration/*.test.ts
```

## Troubleshooting

### imgproxy не запускается

Проверить логи:

```bash
docker logs imgproxy
```

Типичные проблемы:
- Порт 8080 уже занят - измените в docker-compose.yml
- Недостаточно памяти - увеличьте Docker memory limit

### Изображения не оптимизируются

Проверить:

```bash
# Агент видит imgproxy?
curl http://localhost:8080/health

# Включена ли оптимизация?
echo $OPTIMIZE_IMAGES  # должно быть 'true'

# Проверить логи агента
docker logs kiosk-agent | grep media
```

### Низкий cache hit rate

Причины:
- TTL слишком короткий - увеличить `CACHE_TTL`
- Размер кеша недостаточен - увеличить `MAX_CACHE_SIZE`
- Redis недоступен - проверить подключение

Решения:

```bash
# Проверить Redis
redis-cli ping

# Очистить и перезапустить кеш
curl -X DELETE http://localhost:7070/api/media/cache

# Проверить статистику
curl http://localhost:7070/api/media/cache/stats
```

### Большой размер PDF всё равно

Проверить:
- Оптимизация включена в отчетах
- Quality параметры не слишком высокие
- Формат изображений оптимален (JPEG для фото, PNG для графики)

Решение - настроить пресеты:

```typescript
imgproxyConfig.addPreset('custom', {
  width: 600,
  format: 'jpeg',
  quality: 75  // Уменьшить для большей экономии
})
```

## Масштабирование

### Horizontal scaling

Запустить несколько инстансов imgproxy за load balancer:

```yaml
services:
  imgproxy1:
    image: darthsim/imgproxy:latest
    # ... config
  
  imgproxy2:
    image: darthsim/imgproxy:latest
    # ... config
  
  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    ports:
      - "8080:8080"
    depends_on:
      - imgproxy1
      - imgproxy2
```

### Кеширование на CDN

Для публичных изображений используйте CDN:

```typescript
const cdnUrl = 'https://cdn.example.com'
const imgproxyUrl = client.buildProxyUrl(sourceUrl, options)
const publicUrl = imgproxyUrl.replace('http://localhost:8080', cdnUrl)
```

## Дополнительные ресурсы

- [imgproxy Documentation](https://docs.imgproxy.net/)
- [imgproxy GitHub](https://github.com/imgproxy/imgproxy)
- [Redis Documentation](https://redis.io/docs/)
