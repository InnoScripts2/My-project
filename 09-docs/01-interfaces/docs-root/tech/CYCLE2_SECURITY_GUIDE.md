# Security Configuration Guide (Cycle-2)

Руководство по безопасной конфигурации финального коннектора цикла-2.

## Переменные окружения

### Обязательные для PROD

#### Платёжные секреты

```bash
# ЮKassa (production)
YOOKASSA_SHOP_ID="your-shop-id"
YOOKASSA_SECRET_KEY="your-secret-key"
YOOKASSA_RETURN_URL="https://your-kiosk-domain.com/payment-return"

# Webhook secret для проверки HMAC подписи
PROVIDER_WEBHOOK_SECRET="your-webhook-secret-from-yookassa"

# Выбор провайдера (yookassa или sbp)
PAYMENTS_PROVIDER="yookassa"
```

#### Supabase (для вебхуков и персистентности)

```bash
# Публичный URL и anon key (для клиентских запросов)
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"

# Service role key (только для Edge Functions, НЕ публиковать)
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### Конфигурация окружения

```bash
# Режим агента (DEV, QA, PROD)
AGENT_ENV="PROD"

# Версия и канал для метрик
APP_VERSION="0.1.0"

# Персистентность (memory, pg, supabase)
AGENT_PERSISTENCE="supabase"
```

### Политики выдачи устройств

```bash
# Политика выдачи OBD адаптера
# immediate - выдача сразу после выбора авто
# deposit_required - требуется депозит
LOCK_POLICY_OBD="immediate"

# Конфигурация замков (JSON)
LOCK_CONFIGS='[
  {"deviceType": "thickness", "driverType": "serial-relay", "driverConfig": {"port": "/dev/ttyUSB0"}, "autoCloseMs": 30000},
  {"deviceType": "obd", "driverType": "serial-relay", "driverConfig": {"port": "/dev/ttyUSB1"}, "autoCloseMs": 30000}
]'
```

## Безопасность секретов

### Хранение секретов

**❌ Не делать:**
- Хранить секреты в коде
- Коммитить `.env` файлы в Git
- Публиковать service role keys
- Использовать production секреты в dev/qa

**✅ Делать:**
- Использовать environment variables
- Хранить секреты в secure vault (AWS Secrets Manager, HashiCorp Vault)
- Ротировать секреты регулярно
- Использовать разные секреты для dev/qa/prod

### Настройка Vault (пример с AWS Secrets Manager)

```bash
# Получение секретов из AWS Secrets Manager
export YOOKASSA_SHOP_ID=$(aws secretsmanager get-secret-value \
  --secret-id prod/kiosk/yookassa/shop-id \
  --query SecretString --output text)

export YOOKASSA_SECRET_KEY=$(aws secretsmanager get-secret-value \
  --secret-id prod/kiosk/yookassa/secret-key \
  --query SecretString --output text)

export PROVIDER_WEBHOOK_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id prod/kiosk/webhook-secret \
  --query SecretString --output text)
```

### Ротация секретов

**Периодичность:**
- Webhook secrets: каждые 90 дней
- Payment provider keys: каждые 180 дней или при подозрении на компрометацию
- Database credentials: каждые 90 дней

**Процесс ротации:**
1. Создать новый секрет в провайдере
2. Обновить переменные окружения агента
3. Перезапустить агент с новыми секретами
4. Проверить работоспособность
5. Удалить старый секрет из провайдера

## Webhook Security

### HMAC Signature Verification

Вебхуки от платёжных провайдеров должны проверяться по HMAC SHA-256 подписи.

**Edge Function (Deno):**
```typescript
async function verifyHmacSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const bodyData = encoder.encode(body);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, bodyData);
  
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signature.toLowerCase() === expectedSignature.toLowerCase();
}
```

**Проверка подписи:**
```typescript
const signature = req.headers.get("x-provider-signature");
const rawBody = await req.text();

if (signature) {
  const isValid = await verifyHmacSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    return new Response(
      JSON.stringify({ error: "Invalid signature" }),
      { status: 401 }
    );
  }
}
```

### Webhook Endpoint Protection

**Supabase Edge Function:**
- Автоматически защищён CORS
- Service role key не экспортируется
- HMAC проверка обязательна

**Direct agent endpoint (если используется):**
```typescript
// Только для локального тестирования, в PROD использовать Edge Function
app.post('/webhooks/payments', express.raw({ type: 'application/json' }), async (req, res) => {
  // IP whitelist
  const allowedIPs = (process.env.WEBHOOK_ALLOWED_IPS || '').split(',');
  const clientIP = req.ip;
  
  if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // HMAC verification
  const signature = req.headers['x-provider-signature'];
  const rawBody = req.body.toString('utf8');
  
  if (!verifyHmacSignature(rawBody, signature, webhookSecret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook...
});
```

## Rate Limiting

### Configuration

```typescript
// Per-IP rate limiting
const globalRateLimiter = new SimpleRateLimiter(5, 10000); // 5 req/10s

// Per-session rate limiting
const sessionRateLimiter = new SimpleRateLimiter(10, 10000); // 10 req/10s
```

### Custom limits for specific endpoints

```bash
# Environment variables для тонкой настройки
RATE_LIMIT_GLOBAL_MAX=5
RATE_LIMIT_GLOBAL_WINDOW_MS=10000
RATE_LIMIT_SESSION_MAX=10
RATE_LIMIT_SESSION_WINDOW_MS=10000
```

### Monitoring rate limit violations

```promql
# Prometheus query для мониторинга 429 ответов
rate(http_requests_total{status="429"}[5m])
```

## HTTPS/TLS

### Production Requirements

**✅ Обязательно:**
- HTTPS для всех внешних эндпойнтов
- TLS 1.2+ minimum
- Valid SSL certificate (Let's Encrypt или коммерческий)
- HSTS header

**Nginx configuration:**
```nginx
server {
    listen 443 ssl http2;
    server_name kiosk-api.example.com;

    ssl_certificate /etc/letsencrypt/live/kiosk-api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kiosk-api.example.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Network Security

### Firewall Rules

**Inbound (agent):**
- Port 3000: localhost only (для reverse proxy)
- Port 443: external (через Nginx)

**Outbound (agent):**
- Port 443: для API вызовов к ЮKassa, Supabase
- Port 5432: для прямого PostgreSQL подключения (если используется)

**iptables example:**
```bash
# Allow localhost on port 3000
iptables -A INPUT -i lo -p tcp --dport 3000 -j ACCEPT

# Deny external access to port 3000
iptables -A INPUT -p tcp --dport 3000 -j DROP

# Allow HTTPS
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

### VPN для metrics/admin endpoints

**Рекомендация:** Экспонировать `/metrics` и admin endpoints только через VPN.

**Nginx configuration с IP whitelist:**
```nginx
location /metrics {
    allow 10.0.0.0/8;  # Internal network
    allow 127.0.0.1;   # Localhost
    deny all;
    
    proxy_pass http://localhost:3000/metrics;
}
```

## Database Security

### Supabase Row Level Security (RLS)

**Включить RLS для всех таблиц:**
```sql
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
```

**Policies:**
```sql
-- Service role can do everything
CREATE POLICY "Service role full access on webhook_events"
  ON public.webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anonymous users cannot read webhooks
CREATE POLICY "Anon cannot read webhooks"
  ON public.webhook_events
  FOR SELECT
  TO anon
  USING (false);
```

### Connection Security

**✅ Always use:**
- SSL/TLS connections to database
- Connection pooling with limits
- Prepared statements (защита от SQL injection)

**Connection string example:**
```bash
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
```

## Audit Logging

### What to log

**✅ Log:**
- All payment intent creations (amount, service, sessionId)
- All webhook receipts (provider_event_id, signature_verified)
- All lock operations (deviceType, actionId, result)
- Failed authentication attempts
- Rate limit violations

**❌ Don't log:**
- Full credit card numbers
- Full payment provider secrets
- Client passwords or tokens
- Personal identifiable information (PII) beyond necessary

### Log format

```typescript
centralizedLogger.info('locks', 'Замок открыт', {
  context: {
    deviceType: 'thickness',
    actionId: 'thickness-abc123',
    sessionId: 'session-xyz',
    paymentIntentId: 'intent-def456'
  }
});
```

### Log retention

- Application logs: 30 дней (локально)
- Audit logs (webhook_events): 1 год (база данных)
- Metrics: согласно ретеншн политике Prometheus

## Incident Response

### Security Incident Checklist

1. **Обнаружение компрометации:**
   - Немедленно ротировать все секреты
   - Проверить логи на подозрительную активность
   - Заблокировать скомпрометированные ключи у провайдера

2. **Webhook атаки:**
   - Проверить `payments_webhook_verified_total{ok="false"}`
   - Заблокировать IP источника в firewall
   - Обновить webhook secret

3. **Подозрение на несанкционированный доступ:**
   - Проверить логи аутентификации
   - Проверить изменения в webhook_events
   - Провести полный аудит платежей

### Emergency Contacts

```bash
# Security team contacts
SECURITY_TEAM_EMAIL="security@example.com"
SECURITY_TEAM_SLACK="#security-incidents"
SECURITY_ON_CALL_PHONE="+1-XXX-XXX-XXXX"
```

## Compliance

### PCI DSS Considerations

**Note:** Киоск не хранит карточные данные, но обрабатывает платежи через QR коды.

**Requirements:**
- ✅ Secure transmission (HTTPS)
- ✅ No card data storage
- ✅ Audit logging
- ✅ Access control (RLS, firewall)
- ✅ Regular security updates

### GDPR/Privacy

**Данные клиента:**
- Email/phone: только для отправки отчёта
- Хранение: минимальное время (7 дней)
- Удаление: автоматическое по истечении срока

**Privacy policy:**
- Прозрачное описание сбора данных
- Согласие клиента на экране приветствия
- Право на удаление данных

## Security Checklist

### Before Production Deployment

- [ ] Все секреты в secure vault, не в коде
- [ ] HTTPS с валидным сертификатом
- [ ] Webhook HMAC verification активна
- [ ] Rate limiting настроен и протестирован
- [ ] Firewall rules применены
- [ ] RLS policies включены для всех таблиц
- [ ] Audit logging работает
- [ ] Metrics доступны только внутренне
- [ ] DEV-флаги отключены (кнопка "Пропустить")
- [ ] Mock drivers заменены на реальные
- [ ] Тестирование безопасности проведено
- [ ] Incident response план готов
- [ ] Backup и recovery процедуры настроены

### Regular Security Maintenance

**Ежемесячно:**
- [ ] Проверить логи на подозрительную активность
- [ ] Проверить метрики `payments_webhook_verified_total{ok="false"}`
- [ ] Обновить зависимости (`npm audit`, `npm outdated`)

**Ежеквартально:**
- [ ] Ротировать webhook secrets
- [ ] Проверить firewall rules
- [ ] Провести пентест (если возможно)
- [ ] Обновить документацию безопасности

**Ежегодно:**
- [ ] Ротировать все секреты
- [ ] Полный security audit
- [ ] Обновить сертификаты SSL
- [ ] Пересмотреть политики доступа
