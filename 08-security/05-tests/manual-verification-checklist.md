# Manual Verification Checklist — Чеклист ручной верификации безопасности

Этот документ содержит контрольный список для ручной проверки безопасности системы перед production deployment.

## Обзор

**Цель:** Убедиться, что все security controls на месте и работают корректно.

**Частота:**
- Перед каждым production deployment
- После критичных security изменений
- Ежемесячно (регулярный аудит)

**Ответственные:**
- Security Lead (owner)
- QA Lead (исполнитель)
- Dev Lead (консультант)

## 1. Валидация ключей и секретов

### 1.1 Environment Variables

- [ ] `.env` файлы не закоммичены в Git
- [ ] `.gitignore` содержит `.env` и `.env.*`
- [ ] Все необходимые переменные присутствуют (проверить по `.env.example`)
- [ ] PROD секреты отличаются от DEV/QA

**Команды:**
```bash
# Проверить, что .env не в Git
git ls-files | grep -E "\.env$|\.env\."

# Проверить .gitignore
grep -E "\.env" .gitignore
```

### 1.2 Supabase Keys

- [ ] `SUPABASE_SERVICE_ROLE_KEY` установлен в переменных окружения (не в коде)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` используется только в `kiosk-agent` и `cloud-api`
- [ ] `SUPABASE_ANON_KEY` используется только во фронтенде
- [ ] Ключи валидны (тестовое подключение успешно)

**Проверка:**
```bash
# В kiosk-agent
grep -r "SUPABASE_SERVICE_ROLE_KEY" apps/kiosk-agent/src/ | wc -l
# Должно быть 0 — используется только через process.env

# В frontend
grep -r "SUPABASE_SERVICE_ROLE_KEY" apps/kiosk-frontend/ | wc -l
# Должно быть 0 — никогда не используется
```

### 1.3 Payment Provider Keys

- [ ] `YOOKASSA_SHOP_ID` установлен
- [ ] `YOOKASSA_SECRET_KEY` установлен (не в коде, не в логах)
- [ ] `PROVIDER_WEBHOOK_SECRET` установлен и достаточно сложный (>= 32 символа)
- [ ] Test transaction проходит успешно

**Проверка:**
```bash
# Длина webhook secret
echo -n "$PROVIDER_WEBHOOK_SECRET" | wc -c
# Должно быть >= 32
```

### 1.4 SMTP/SMS Credentials

- [ ] `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` установлены (если требуется)
- [ ] Test email отправляется успешно
- [ ] Credentials не логируются

---

## 2. RLS Policies (Row Level Security)

### 2.1 Database Policies

- [ ] RLS включен для всех таблиц: `diagnostics`, `sessions`, `payments`, `audit_logs`
- [ ] Anon key не имеет INSERT/UPDATE/DELETE прав
- [ ] Service role имеет полный доступ
- [ ] Публичный VIEW (`diagnostics_public`) не содержит PII

**SQL проверка:**
```sql
-- Проверить, что RLS включен
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename IN ('diagnostics', 'sessions', 'payments', 'audit_logs');
-- rowsecurity должен быть true для всех

-- Проверить политики
SELECT tablename, policyname, roles, cmd 
FROM pg_policies 
WHERE schemaname = 'public';
```

### 2.2 Test Access

- [ ] Попытка записи с anon key в `diagnostics` возвращает ошибку
- [ ] Попытка чтения из `sessions` с anon key возвращает ошибку
- [ ] Чтение из `diagnostics_public` с anon key работает

**Тест (через psql или Supabase Studio):**
```javascript
// С anon key (должна быть ошибка)
const { error } = await supabase
  .from('diagnostics')
  .insert({ session_id: 'test' });
// Ожидается: error 403 или RLS violation
```

---

## 3. Роли и авторизация

### 3.1 API Endpoints

- [ ] `/api/obd/connect` доступен только от localhost (или с валидным токеном)
- [ ] `/api/payments/create-intent` требует валидные параметры (zod validation)
- [ ] `/api/admin/*` endpoints защищены (если есть)
- [ ] `/metrics` endpoint доступен только внутренне (не публичный)

**Проверка:**
```bash
# Попытка вызова с внешнего IP (должна быть ошибка)
curl http://your-kiosk-ip:7070/api/obd/connect
# Ожидается: 403 или CORS error

# Попытка вызова без параметров
curl -X POST http://localhost:7070/api/payments/create-intent
# Ожидается: 400 validation error
```

### 3.2 Frontend Access Control

- [ ] Настройки (`source` switcher) скрыты в PROD (только DEV или Ctrl+Shift+S)
- [ ] Кнопка "Пропустить" недоступна в PROD
- [ ] Device operations disabled при `source=supabase`

**Проверка:**
```bash
# Проверить, что DEV флаги не активны
grep -r "AGENT_ENV.*DEV" apps/kiosk-frontend/
# Не должно быть хардкода DEV в PROD build

# Проверить settings toggle
# В index.html: source switcher должен проверять AGENT_ENV или ?dev=1
```

---

## 4. Токены и сессии

### 4.1 JWT Tokens (если используются)

- [ ] Токены подписаны корректным секретом
- [ ] Время жизни токенов адекватно (не вечные)
- [ ] Refresh tokens хранятся безопасно
- [ ] Expired tokens отклоняются

### 4.2 Session Management

- [ ] Сессии автоматически сбрасываются по таймауту
- [ ] Session ID не предсказуемы (crypto.randomUUID())
- [ ] Старые сессии очищаются (retention policy)

**Проверка:**
```bash
# Проверить формат session_id в БД
# Должен быть UUID v4 формат
```

---

## 5. Webhook Security

### 5.1 HMAC Verification

- [ ] Webhook endpoint проверяет HMAC подпись
- [ ] Неверная подпись отклоняется (403)
- [ ] Код проверки протестирован с реальными webhook'ами

**Тест:**
```bash
# Отправить webhook без подписи
curl -X POST http://localhost:7070/api/webhooks/payment \
  -H "Content-Type: application/json" \
  -d '{"event": "test"}'
# Ожидается: 403 Forbidden

# Отправить с неверной подписью
curl -X POST http://localhost:7070/api/webhooks/payment \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: invalid" \
  -d '{"event": "test"}'
# Ожидается: 403 Forbidden
```

### 5.2 Replay Protection

- [ ] Webhook events с одинаковым ID обрабатываются только один раз
- [ ] Timestamp проверяется (не старше N минут)

---

## 6. HTTPS/TLS

### 6.1 Certificate Validation

- [ ] HTTPS сертификат валиден (не self-signed в PROD)
- [ ] Сертификат не истекает в ближайшие 30 дней
- [ ] Цепочка сертификатов корректна

**Проверка:**
```bash
# Проверить сертификат
openssl s_client -connect kiosk.example.com:443 -servername kiosk.example.com < /dev/null 2>/dev/null | openssl x509 -noout -dates
# Проверить, что Not After > now + 30 days
```

### 6.2 TLS Configuration

- [ ] TLS 1.2+ используется (TLS 1.0/1.1 отключены)
- [ ] Secure ciphers настроены
- [ ] HSTS header установлен

**Проверка:**
```bash
# SSL Labs scan
# https://www.ssllabs.com/ssltest/analyze.html?d=kiosk.example.com
```

---

## 7. Rate Limiting

### 7.1 API Rate Limits

- [ ] Rate limiting настроен на Cloud API (`express-rate-limit`)
- [ ] `CLOUD_API_RATE_LIMIT_MAX` и `CLOUD_API_RATE_LIMIT_WINDOW_MS` установлены
- [ ] Превышение лимита возвращает 429

**Тест:**
```bash
# Отправить > 100 запросов за минуту
for i in {1..105}; do
  curl http://localhost:7071/api/diagnostics/public
done
# Последние запросы должны вернуть 429
```

### 7.2 Firewall Rules

- [ ] Firewall настроен (только порты 80, 443, SSH открыты)
- [ ] Agent port (7070) доступен только локально
- [ ] Admin порты (если есть) защищены

---

## 8. Security Headers

### 8.1 HTTP Headers

- [ ] `Content-Security-Policy` установлен
- [ ] `X-Content-Type-Options: nosniff` установлен
- [ ] `X-Frame-Options: DENY` установлен
- [ ] `X-XSS-Protection: 1; mode=block` установлен
- [ ] `Strict-Transport-Security` установлен (PROD)

**Проверка:**
```bash
curl -I https://kiosk.example.com | grep -E "Content-Security-Policy|X-Frame-Options|Strict-Transport-Security"
```

### 8.2 CORS

- [ ] CORS настроен с whitelist (`ALLOWED_ORIGINS`)
- [ ] `*` не используется в production
- [ ] Credentials: true только для trusted origins

---

## 9. Логирование и аудит

### 9.1 Audit Logs

- [ ] Все критичные действия логируются (оплата, выдача устройства, сброс DTC)
- [ ] Логи содержат timestamp, user/session_id, action
- [ ] Логи защищены append-only политикой

### 9.2 Log Rotation

- [ ] `LOG_MAX_ENTRIES` и `LOG_ROTATE_AFTER_MS` установлены
- [ ] Старые логи архивируются (не удаляются немедленно)
- [ ] Персональные данные redacted в логах

**Проверка:**
```bash
# Проверить, что секреты не в логах
grep -r "YOOKASSA_SECRET_KEY\|SERVICE_ROLE_KEY" artifacts/logs/
# Должно быть 0 результатов (или только [REDACTED])
```

---

## 10. Device Security

### 10.1 OBD-II Adapter

- [ ] Whitelist портов/MAC-адресов настроен (если применимо)
- [ ] Команды валидируются перед отправкой
- [ ] Таймауты установлены (`OBD_CONNECT_MAX_ATTEMPTS`, `OBD_OPERATION_MAX_ATTEMPTS`)

### 10.2 Thickness Meter

- [ ] SDK официальный (не взломанный/reverse-engineered)
- [ ] Соединение BLE защищено (pairing)
- [ ] Данные валидируются (например, толщина в пределах 0-5000 мкм)

### 10.3 Device Locks

- [ ] Выдача устройства только после подтверждённой оплаты
- [ ] Логирование всех команд openSlot/closeSlot
- [ ] Физическая защита контроллера

---

## 11. Compliance & Legal

### 11.1 Персональные данные

- [ ] Минимальный сбор (только email/phone для отчётов)
- [ ] Короткий срок хранения (retention policy)
- [ ] Пользовательское соглашение принято до начала услуги
- [ ] Клиент информирован о хранении данных

### 11.2 PCI DSS (если применимо)

- [ ] Платёжные данные не хранятся (только payment_id от провайдера)
- [ ] Все транзакции через certified провайдера (ЮKassa)

---

## 12. Incident Response

### 12.1 Plan Readiness

- [ ] Incident response план подготовлен
- [ ] Контакты security team доступны 24/7
- [ ] Процедуры rollback протестированы

### 12.2 Monitoring

- [ ] Metrics endpoint работает (`/metrics`)
- [ ] Alerting настроен (Prometheus/Grafana или аналог)
- [ ] Алерты для критичных событий (payment failure, device disconnection)

---

## Сводная таблица статуса

| Категория | Пунктов | Выполнено | Статус |
|-----------|---------|-----------|--------|
| Ключи и секреты | 15 | — | ⏳ |
| RLS Policies | 8 | — | ⏳ |
| Роли и авторизация | 9 | — | ⏳ |
| Токены и сессии | 7 | — | ⏳ |
| Webhook Security | 5 | — | ⏳ |
| HTTPS/TLS | 6 | — | ⏳ |
| Rate Limiting | 5 | — | ⏳ |
| Security Headers | 7 | — | ⏳ |
| Логирование | 6 | — | ⏳ |
| Device Security | 9 | — | ⏳ |
| Compliance | 6 | — | ⏳ |
| Incident Response | 5 | — | ⏳ |
| **ИТОГО** | **88** | **—** | **⏳** |

## Использование чеклиста

1. **Перед проверкой:** сделать копию этого файла с датой (например, `verification-2024-12-15.md`)
2. **Во время проверки:** отмечать [x] выполненные пункты
3. **Документировать отклонения:** если пункт не выполнен, добавить примечание и issue ID
4. **После проверки:** обновить сводную таблицу и отчитаться Security Lead

## Отчётность

**Формат отчёта:**
- Дата проверки: YYYY-MM-DD
- Исполнитель: Имя QA Lead
- Статус: ✅ Passed / ⚠️ Passed with exceptions / ❌ Failed
- Критичные находки: список
- Рекомендации: список
- Срок устранения: дата

**Пример:**
```
Дата: 2024-12-15
Исполнитель: Ivan Ivanov
Статус: ⚠️ Passed with exceptions
Критичные находки:
  - PROVIDER_WEBHOOK_SECRET менее 32 символов (#123)
  - RLS отключен для таблицы audit_logs (#124)
Рекомендации:
  - Усилить webhook secret
  - Включить RLS для audit_logs
Срок устранения: 2024-12-16
```

## Связанные документы

- `08-security/01-interfaces/policies/` — образцы политик
- `08-security/03-domain/threat-model/` — модель угроз STRIDE
- `09-docs/01-interfaces/docs-root/tech/CYCLE2_SECURITY_GUIDE.md` — полное руководство
