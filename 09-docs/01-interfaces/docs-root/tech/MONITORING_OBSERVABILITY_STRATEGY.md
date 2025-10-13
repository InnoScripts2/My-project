# Стратегия мониторинга и наблюдаемости

## Обзор

Документ описывает комплексную систему мониторинга, логирования и наблюдаемости для достижения SLA ≥ 99.9% и поддержки 100+ одновременных терминалов.

## 1. Структура метрик (Prometheus)

### 1.1 Категории метрик

```typescript
// apps/kiosk-agent/src/monitoring/MetricsRegistry.ts
import { Counter, Gauge, Histogram, Summary, Registry } from 'prom-client';

export class MetricsRegistry {
  private registry: Registry;
  
  // Счётчики (Counter) — только увеличиваются
  public readonly httpRequestsTotal: Counter;
  public readonly sessionsCreatedTotal: Counter;
  public readonly paymentsTotal: Counter;
  public readonly deviceErrorsTotal: Counter;
  
  // Датчики (Gauge) — текущее значение
  public readonly activeSessions: Gauge;
  public readonly activeDevices: Gauge;
  public readonly queueLength: Gauge;
  public readonly memoryUsage: Gauge;
  
  // Гистограммы (Histogram) — распределение значений
  public readonly httpRequestDuration: Histogram;
  public readonly sessionDuration: Histogram;
  public readonly paymentDuration: Histogram;
  public readonly reportGenerationDuration: Histogram;
  
  // Сводки (Summary) — статистика за период
  public readonly deviceLatency: Summary;
  
  constructor() {
    this.registry = new Registry();
    
    // HTTP Requests
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
    
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
    
    // Sessions
    this.sessionsCreatedTotal = new Counter({
      name: 'sessions_created_total',
      help: 'Total sessions created',
      labelNames: ['service_type'],
      registers: [this.registry],
    });
    
    this.activeSessions = new Gauge({
      name: 'active_sessions',
      help: 'Number of active sessions',
      labelNames: ['service_type'],
      registers: [this.registry],
    });
    
    this.sessionDuration = new Histogram({
      name: 'session_duration_seconds',
      help: 'Session duration from start to completion',
      labelNames: ['service_type', 'outcome'],
      buckets: [60, 120, 300, 600, 1800, 3600], // 1m, 2m, 5m, 10m, 30m, 1h
      registers: [this.registry],
    });
    
    // Payments
    this.paymentsTotal = new Counter({
      name: 'payments_total',
      help: 'Total payment transactions',
      labelNames: ['provider', 'status'],
      registers: [this.registry],
    });
    
    this.paymentDuration = new Histogram({
      name: 'payment_duration_seconds',
      help: 'Payment processing duration',
      labelNames: ['provider', 'status'],
      buckets: [1, 5, 10, 30, 60, 120],
      registers: [this.registry],
    });
    
    // Devices
    this.activeDevices = new Gauge({
      name: 'active_devices',
      help: 'Number of active devices',
      labelNames: ['type'], // obd, thickness
      registers: [this.registry],
    });
    
    this.deviceErrorsTotal = new Counter({
      name: 'device_errors_total',
      help: 'Total device errors',
      labelNames: ['device_type', 'error_code'],
      registers: [this.registry],
    });
    
    this.deviceLatency = new Summary({
      name: 'device_latency_seconds',
      help: 'Device communication latency',
      labelNames: ['device_type', 'command'],
      percentiles: [0.5, 0.9, 0.95, 0.99],
      registers: [this.registry],
    });
    
    // Reports
    this.reportGenerationDuration = new Histogram({
      name: 'report_generation_duration_seconds',
      help: 'Report generation duration',
      labelNames: ['report_type'],
      buckets: [0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });
    
    // System
    this.queueLength = new Gauge({
      name: 'queue_length',
      help: 'Number of items in processing queue',
      labelNames: ['queue_name'],
      registers: [this.registry],
    });
    
    this.memoryUsage = new Gauge({
      name: 'memory_usage_bytes',
      help: 'Process memory usage',
      labelNames: ['type'], // rss, heapUsed, heapTotal, external
      registers: [this.registry],
    });
    
    // Автоматическое обновление системных метрик
    this.startSystemMetricsCollection();
  }
  
  private startSystemMetricsCollection(): void {
    setInterval(() => {
      const mem = process.memoryUsage();
      this.memoryUsage.set({ type: 'rss' }, mem.rss);
      this.memoryUsage.set({ type: 'heapUsed' }, mem.heapUsed);
      this.memoryUsage.set({ type: 'heapTotal' }, mem.heapTotal);
      this.memoryUsage.set({ type: 'external' }, mem.external);
    }, 10000); // Каждые 10 секунд
  }
  
  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
```

### 1.2 Middleware для автоматического сбора метрик

```typescript
// apps/kiosk-agent/src/monitoring/MetricsMiddleware.ts
export function metricsMiddleware(metrics: MetricsRegistry) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path;
      
      metrics.httpRequestsTotal.inc({
        method: req.method,
        route,
        status: res.statusCode,
      });
      
      metrics.httpRequestDuration.observe(
        { method: req.method, route },
        duration
      );
    });
    
    next();
  };
}
```

### 1.3 Бизнес-метрики

```typescript
// apps/kiosk-agent/src/monitoring/BusinessMetrics.ts
class BusinessMetrics {
  constructor(private metrics: MetricsRegistry) {}
  
  trackSessionStarted(serviceType: 'thickness' | 'diagnostics'): void {
    this.metrics.sessionsCreatedTotal.inc({ service_type: serviceType });
    this.metrics.activeSessions.inc({ service_type: serviceType });
  }
  
  trackSessionCompleted(
    serviceType: string,
    duration: number,
    outcome: 'completed' | 'cancelled' | 'error'
  ): void {
    this.metrics.sessionDuration.observe(
      { service_type: serviceType, outcome },
      duration
    );
    this.metrics.activeSessions.dec({ service_type: serviceType });
  }
  
  trackPayment(
    provider: string,
    status: 'pending' | 'completed' | 'failed',
    duration: number
  ): void {
    this.metrics.paymentsTotal.inc({ provider, status });
    this.metrics.paymentDuration.observe({ provider, status }, duration);
  }
  
  trackDeviceError(deviceType: string, errorCode: string): void {
    this.metrics.deviceErrorsTotal.inc({
      device_type: deviceType,
      error_code: errorCode,
    });
  }
  
  trackReportGeneration(reportType: string, duration: number): void {
    this.metrics.reportGenerationDuration.observe(
      { report_type: reportType },
      duration
    );
  }
}
```

## 2. Структурированное логирование

### 2.1 Winston logger конфигурация

```typescript
// packages/logging/Logger.ts
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logLevel = process.env.LOG_LEVEL || 'info';
const logDir = process.env.LOG_DIR || '/var/log/kiosk-agent';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'kiosk-agent',
    hostname: os.hostname(),
    pid: process.pid,
  },
  transports: [
    // Console для development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      silent: process.env.NODE_ENV === 'production',
    }),
    
    // Файл для всех логов с ротацией
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '100m',
      maxFiles: '30d',
      zippedArchive: true,
    }),
    
    // Отдельный файл для ошибок
    new DailyRotateFile({
      level: 'error',
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '100m',
      maxFiles: '90d',
      zippedArchive: true,
    }),
  ],
});

// Специальные логгеры для разных компонентов
export const deviceLogger = logger.child({ component: 'device' });
export const paymentLogger = logger.child({ component: 'payment' });
export const sessionLogger = logger.child({ component: 'session' });
export const securityLogger = logger.child({ component: 'security' });
```

### 2.2 Структурированные логи примеры

```typescript
// Пример использования
import { logger, sessionLogger, paymentLogger } from './Logger';

// Обычный лог
logger.info('Server started', { port: 7070, env: 'production' });

// Лог сессии
sessionLogger.info('Session created', {
  sessionId: '123',
  serviceType: 'diagnostics',
  userId: 'user456',
});

// Лог платежа
paymentLogger.info('Payment completed', {
  paymentId: 'pay_789',
  amount: 480,
  currency: 'RUB',
  provider: 'yookassa',
  duration: 1234,
});

// Лог ошибки с контекстом
logger.error('Device connection failed', {
  deviceType: 'obd',
  port: 'COM3',
  error: error.message,
  stack: error.stack,
});
```

### 2.3 Корреляция логов через request ID

```typescript
// apps/kiosk-agent/src/middleware/RequestId.ts
import { v4 as uuidv4 } from 'uuid';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  // Добавление requestId в child logger
  req.logger = logger.child({ requestId });
  
  next();
}

// Использование
app.use(requestIdMiddleware);

app.get('/api/test', (req, res) => {
  req.logger.info('Test endpoint called');
  res.json({ success: true });
});
```

## 3. Интеграция с внешними системами мониторинга

### 3.1 Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Kiosk Health Overview",
    "tags": ["kiosk", "monitoring"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Active Sessions",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(active_sessions) by (service_type)",
            "legendFormat": "{{service_type}}"
          }
        ],
        "yaxes": [
          { "format": "short", "label": "Sessions" }
        ]
      },
      {
        "id": 2,
        "title": "Payment Success Rate",
        "type": "singlestat",
        "targets": [
          {
            "expr": "rate(payments_total{status='completed'}[5m]) / rate(payments_total[5m]) * 100"
          }
        ],
        "format": "percent",
        "thresholds": "80,95"
      },
      {
        "id": 3,
        "title": "Device Uptime",
        "type": "gauge",
        "targets": [
          {
            "expr": "avg(active_devices) by (type)"
          }
        ]
      },
      {
        "id": 4,
        "title": "HTTP Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{route}}"
          }
        ]
      },
      {
        "id": 5,
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~'5..'}[5m])",
            "legendFormat": "HTTP 5xx"
          },
          {
            "expr": "rate(device_errors_total[5m])",
            "legendFormat": "Device errors"
          }
        ]
      },
      {
        "id": 6,
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "memory_usage_bytes{type='heapUsed'} / 1024 / 1024",
            "legendFormat": "Heap Used (MB)"
          }
        ]
      }
    ]
  }
}
```

### 3.2 AlertManager правила

```yaml
# prometheus/alerts/kiosk-alerts.yml
groups:
  - name: kiosk_critical
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High HTTP error rate"
          description: "Error rate is {{ $value | humanizePercentage }} (threshold: 5%)"
      
      - alert: DatabaseConnectionFailed
        expr: up{job="kiosk-agent-db"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Database connection failed"
          description: "Cannot connect to database for 1 minute"
      
      - alert: DeviceOffline
        expr: active_devices{type="obd"} == 0
        for: 10m
        labels:
          severity: high
        annotations:
          summary: "OBD device offline"
          description: "No active OBD devices for 10 minutes"
      
      - alert: HighMemoryUsage
        expr: memory_usage_bytes{type="heapUsed"} / 1024 / 1024 > 1024
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value | humanize }}MB (threshold: 1024MB)"
      
      - alert: LowPaymentSuccessRate
        expr: |
          rate(payments_total{status="completed"}[10m]) 
          / 
          rate(payments_total[10m]) < 0.9
        for: 10m
        labels:
          severity: high
        annotations:
          summary: "Low payment success rate"
          description: "Payment success rate is {{ $value | humanizePercentage }} (threshold: 90%)"
```

### 3.3 Sentry для ошибок

```typescript
// apps/kiosk-agent/src/monitoring/Sentry.ts
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    
    // Трассировка производительности
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Профилирование
    profilesSampleRate: 0.1,
    integrations: [
      new ProfilingIntegration(),
    ],
    
    // Фильтрация чувствительных данных
    beforeSend(event, hint) {
      // Удаление PII из event
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      
      // Удаление PII из extra
      if (event.extra?.payment) {
        delete event.extra.payment.cardNumber;
      }
      
      return event;
    },
  });
}

// Express middleware
export function sentryRequestHandler() {
  return Sentry.Handlers.requestHandler();
}

export function sentryErrorHandler() {
  return Sentry.Handlers.errorHandler();
}

// Использование
app.use(sentryRequestHandler());
// ... routes ...
app.use(sentryErrorHandler());
```

### 3.4 ELK Stack интеграция

```yaml
# filebeat/filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/kiosk-agent/combined-*.log
      - /var/log/kiosk-agent/error-*.log
    json.keys_under_root: true
    json.add_error_key: true
    fields:
      app: kiosk-agent
      env: production
    fields_under_root: true

processors:
  - add_host_metadata: ~
  - add_cloud_metadata: ~
  - add_docker_metadata: ~

output.logstash:
  hosts: ["logstash:5044"]
  ssl.enabled: true
  ssl.certificate_authorities: ["/etc/pki/tls/certs/logstash.crt"]
```

```conf
# logstash/logstash.conf
input {
  beats {
    port => 5044
    ssl => true
    ssl_certificate => "/etc/pki/tls/certs/logstash.crt"
    ssl_key => "/etc/pki/tls/private/logstash.key"
  }
}

filter {
  # Парсинг JSON
  if [message] =~ /^{/ {
    json {
      source => "message"
    }
  }
  
  # Добавление геолокации
  if [ip] {
    geoip {
      source => "ip"
      target => "geoip"
    }
  }
  
  # Извлечение полей
  if [metadata][component] {
    mutate {
      add_field => { "component" => "%{[metadata][component]}" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "kiosk-logs-%{+YYYY.MM.dd}"
    user => "elastic"
    password => "${ELASTICSEARCH_PASSWORD}"
  }
}
```

## 4. Health Checks и Liveness Probes

### 4.1 Endpoint для health check

```typescript
// apps/kiosk-agent/src/routes/health.ts
interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: CheckStatus;
    devices: CheckStatus;
    payments: CheckStatus;
    storage: CheckStatus;
  };
}

interface CheckStatus {
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  latency?: number;
}

app.get('/health', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  const checks = {
    database: await checkDatabase(),
    devices: await checkDevices(),
    payments: await checkPayments(),
    storage: await checkStorage(),
  };
  
  // Определение общего статуса
  const statuses = Object.values(checks).map(c => c.status);
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  
  if (statuses.every(s => s === 'pass')) {
    overallStatus = 'healthy';
  } else if (statuses.some(s => s === 'fail')) {
    overallStatus = 'unhealthy';
  } else {
    overallStatus = 'degraded';
  }
  
  const result: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  };
  
  const statusCode = overallStatus === 'healthy' ? 200 : 503;
  res.status(statusCode).json(result);
});

async function checkDatabase(): Promise<CheckStatus> {
  try {
    const start = Date.now();
    await store.ping();
    const latency = Date.now() - start;
    
    if (latency > 1000) {
      return { status: 'warn', message: 'High latency', latency };
    }
    
    return { status: 'pass', latency };
  } catch (error: any) {
    return { status: 'fail', message: error.message };
  }
}

async function checkDevices(): Promise<CheckStatus> {
  const devices = await deviceManager.getStatus();
  const activeCount = devices.filter(d => d.connected).length;
  
  if (activeCount === 0) {
    return { status: 'fail', message: 'No active devices' };
  }
  
  if (activeCount < devices.length / 2) {
    return { status: 'warn', message: 'Some devices offline' };
  }
  
  return { status: 'pass' };
}
```

### 4.2 Kubernetes probes

```yaml
# kubernetes/deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kiosk-agent
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: kiosk-agent
        image: kiosk-agent:latest
        ports:
        - containerPort: 7070
        
        # Готовность принимать трафик
        readinessProbe:
          httpGet:
            path: /health
            port: 7070
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 3
        
        # Процесс живой
        livenessProbe:
          httpGet:
            path: /health
            port: 7070
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        # Готовность к началу работы
        startupProbe:
          httpGet:
            path: /health
            port: 7070
          initialDelaySeconds: 0
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 30
```

## 5. Distributed Tracing

### 5.1 OpenTelemetry интеграция

```typescript
// apps/kiosk-agent/src/monitoring/Tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export function initTracing() {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'kiosk-agent',
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version,
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  
  sdk.start();
  
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.error('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
}
```

### 5.2 Кастомные spans

```typescript
// Пример создания кастомных spans
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('kiosk-agent');

async function processPayment(paymentData: PaymentData) {
  const span = tracer.startSpan('processPayment');
  
  try {
    span.setAttribute('payment.amount', paymentData.amount);
    span.setAttribute('payment.currency', paymentData.currency);
    
    // Создание intent
    const intentSpan = tracer.startSpan('createPaymentIntent', { parent: span });
    const intent = await paymentProvider.createIntent(paymentData);
    intentSpan.end();
    
    // Проверка статуса
    const statusSpan = tracer.startSpan('checkPaymentStatus', { parent: span });
    const status = await paymentProvider.getStatus(intent.id);
    statusSpan.end();
    
    span.setStatus({ code: SpanStatusCode.OK });
    return status;
  } catch (error: any) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    throw error;
  } finally {
    span.end();
  }
}
```

## 6. SLA Мониторинг и Отчётность

### 6.1 SLA Tracker

```typescript
// apps/kiosk-agent/src/monitoring/SLATracker.ts
class SLATracker {
  private incidents: Incident[] = [];
  
  async calculateUptime(period: DateRange): Promise<number> {
    const totalMinutes = this.getTotalMinutes(period);
    const downtime = await this.getDowntimeMinutes(period);
    
    return ((totalMinutes - downtime) / totalMinutes) * 100;
  }
  
  async getDowntimeMinutes(period: DateRange): Promise<number> {
    const incidents = await this.getIncidents(period);
    
    return incidents.reduce((total, incident) => {
      const duration = incident.resolvedAt
        ? (incident.resolvedAt.getTime() - incident.startedAt.getTime()) / 60000
        : 0;
      
      return total + duration;
    }, 0);
  }
  
  async generateSLAReport(period: DateRange): Promise<SLAReport> {
    const uptime = await this.calculateUptime(period);
    const incidents = await this.getIncidents(period);
    
    return {
      period,
      uptime,
      target: 99.9,
      met: uptime >= 99.9,
      incidents: incidents.length,
      totalDowntime: await this.getDowntimeMinutes(period),
      mttr: this.calculateMTTR(incidents),
      mtbf: this.calculateMTBF(incidents),
    };
  }
  
  private calculateMTTR(incidents: Incident[]): number {
    // Mean Time To Repair
    if (incidents.length === 0) return 0;
    
    const totalRepairTime = incidents.reduce((total, incident) => {
      if (!incident.resolvedAt) return total;
      return total + (incident.resolvedAt.getTime() - incident.startedAt.getTime());
    }, 0);
    
    return totalRepairTime / incidents.length / 60000; // В минутах
  }
  
  private calculateMTBF(incidents: Incident[]): number {
    // Mean Time Between Failures
    if (incidents.length < 2) return Infinity;
    
    const sortedIncidents = incidents.sort((a, b) => 
      a.startedAt.getTime() - b.startedAt.getTime()
    );
    
    let totalTimeBetween = 0;
    for (let i = 1; i < sortedIncidents.length; i++) {
      const timeBetween = sortedIncidents[i].startedAt.getTime() 
        - (sortedIncidents[i - 1].resolvedAt?.getTime() || sortedIncidents[i - 1].startedAt.getTime());
      
      totalTimeBetween += timeBetween;
    }
    
    return totalTimeBetween / (incidents.length - 1) / 60000; // В минутах
  }
}
```

### 6.2 Автоматическая отчётность

```typescript
// Ежемесячный отчёт
cron.schedule('0 0 1 * *', async () => {
  const lastMonth = {
    from: new Date(new Date().setMonth(new Date().getMonth() - 1)),
    to: new Date(),
  };
  
  const report = await slaTracker.generateSLAReport(lastMonth);
  
  // Отправка отчёта
  await emailService.send({
    to: 'operations@example.com',
    subject: `SLA Report for ${lastMonth.from.toLocaleDateString()}`,
    body: formatSLAReport(report),
    attachments: [
      {
        filename: 'sla-report.pdf',
        content: await generatePDFReport(report),
      },
    ],
  });
});
```

## Заключение

Эта стратегия мониторинга обеспечивает:
- **Полную видимость:** метрики, логи, трассировка
- **Проактивность:** алерты, health checks, SLA tracking
- **Интеграции:** Prometheus, Grafana, Sentry, ELK
- **Автоматизацию:** автосбор метрик, корреляция, отчётность

Все компоненты работают совместно для достижения целевого SLA ≥ 99.9%.
