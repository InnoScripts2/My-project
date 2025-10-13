# Централизованное логирование и мониторинг

## Обзор

Модуль централизованного логирования обеспечивает единую точку сбора, хранения и анализа всех логов системы киоска самообслуживания.

## Компоненты

### CentralizedLogger

Центральный логгер с поддержкой:
- Каналов логирования (obd, thk, payments, report, locks, infra, general)
- Уровней логирования (debug, info, warn, error, fatal)
- Автоматического маскирования чувствительных данных (email, телефоны, токены)
- Привязки к запросам через requestId и sessionId
- Ротации логов по размеру и времени
- Поиска и фильтрации

#### Использование

```typescript
import { centralizedLogger } from './logging/CentralizedLogger.js';

// Простое логирование
centralizedLogger.info('obd', 'Адаптер подключён');

// С контекстом
centralizedLogger.error('payments', 'Ошибка создания платежа', {
  context: { intentId: 'intent_123', amount: 480 },
  error: err,
});

// С привязкой к запросу
centralizedLogger.warn('obd', 'Таймаут команды', {
  requestId: req.id,
  sessionId: session.id,
});

// Поиск логов
const errors = centralizedLogger.query({
  level: 'error',
  channel: 'obd',
  limit: 100,
});

// Получение последних записей
const recent = centralizedLogger.tail(50);

// Статистика
const stats = centralizedLogger.getStats();
console.log(`Всего логов: ${stats.totalEntries}`);
console.log(`Ошибок: ${stats.byLevel.error}`);
```

#### Конфигурация через ENV

```bash
# Максимальное количество записей в памяти
LOG_MAX_ENTRIES=10000

# Период ротации логов (мс)
LOG_ROTATE_AFTER_MS=86400000

# Вывод в консоль
LOG_ENABLE_CONSOLE=true

# Минимальный уровень (debug|info|warn|error|fatal)
LOG_MIN_LEVEL=info
```

### AnomalyDetector

Автоматический детектор аномалий и паттернов сбоев. Поддерживает:
- Шторм ошибок (>10 ошибок за 60 секунд)
- Частые сбои подключения OBD (>5 за 5 минут)
- Задержки платежей (>3 pending >90 секунд)
- Повторяющиеся ошибки (>5 раз за 10 минут)
- Превышение частоты запросов (>100 в минуту к каналу)

#### Использование

```typescript
import { AnomalyDetector } from './logging/AnomalyDetector.js';
import { centralizedLogger } from './logging/CentralizedLogger.js';

const detector = new AnomalyDetector();

// Периодический анализ
setInterval(() => {
  const entries = centralizedLogger.tail(1000);
  const anomalies = detector.detect(entries);
  
  for (const anomaly of anomalies) {
    console.warn(`[ANOMALY] ${anomaly.patternName}: ${anomaly.description}`);
    // Отправка алерта в систему мониторинга
  }
}, 60_000); // каждую минуту

// Получение истории аномалий
const criticalAnomalies = detector.getDetectedAnomalies({
  severity: 'critical',
});
```

## Архитектура

```
┌─────────────────────┐
│  Application Code   │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ CentralizedLogger   │
│ - Channels          │
│ - Levels            │
│ - Masking           │
│ - Rotation          │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│  In-Memory Store    │
│  (+ rotation)       │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│  AnomalyDetector    │
│  - Built-in patterns│
│  - Custom patterns  │
└─────────────────────┘
```

## Безопасность

### Маскирование данных

Автоматически маскируются:
- Email адреса (`test@example.com` → `***`)
- Телефонные номера (`89991234567` → `***`)
- Длинные hex/base64 строки (потенциальные токены)

### Контроль доступа

Логи содержат чувствительную информацию о работе системы. Доступ к API просмотра логов должен быть ограничен:
- DEV/QA режимы: доступ открыт для отладки
- PROD режим: доступ только через внутренний терминал с аутентификацией

## Интеграция с внутренним терминалом

Централизованный логгер является основой для встроенного внутреннего терминала (M21). Терминал предоставляет:
- Просмотр логов в реальном времени
- Фильтрацию и поиск
- Анализ аномалий
- Экспорт логов

Подробнее см. документацию по внутреннему терминалу (TODO: ссылка на docs после реализации UI терминала).

## Производительность

- In-memory хранилище: быстрый доступ к логам
- Ограничение размера: автоматическое удаление старых записей
- Ротация: периодическое сохранение в архив (TODO: реализовать персистентность)

## TODO

- [ ] Персистентность логов (экспорт в файлы/БД)
- [ ] Интеграция с внешними системами мониторинга (Grafana, PagerDuty)
- [ ] UI внутреннего терминала
- [ ] Дополнительные паттерны аномалий
- [ ] Метрики производительности логгера
