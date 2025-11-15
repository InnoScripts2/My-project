# Интеграция с n8n (GET webhook)

Цель: триггерить автоматизацию в n8n из локального агента киоска.

## Конфигурация окружения

- N8N_WEBHOOK_URL — полный URL вебхука (приоритетно), например:
  <https://innoservice.app.n8n.cloud/webhook/a5ff1e72-7e5c-47c5-8c5e-64e9c4537f52>
- или N8N_WEBHOOK_BASE — базовый URL (по умолчанию <https://innoservice.app.n8n.cloud/webhook/>)
- и N8N_WEBHOOK_PATH — путь вебхука (по умолчанию a5ff1e72-7e5c-47c5-8c5e-64e9c4537f52)
- N8N_TOKEN — необязательный токен, будет добавлен в query param token
- N8N_TIMEOUT_MS — таймаут запроса (по умолчанию 2500 мс)

## Эндпойнты агента

- GET /api/integrations/n8n/ping — проверка доступности n8n; ответ { ok, latency? }
- GET /api/integrations/n8n/trigger?event=name&k=v — триггер произвольного события; все query кроме event передаются в n8n
- GET /health/integrations — включает проверку n8n (ok/error/not_configured)

## Как использовать

1) Установите переменные окружения (N8N_WEBHOOK_URL или BASE+PATH).
2) Вызов из UI или скрипта: GET /api/integrations/n8n/trigger?event=payment_succeeded&amount=480&service=diagnostics
3) В n8n читайте параметры из webhook query (event, agent_env, ts, token, и др.).

## Сценарии

- Уведомление об успешной оплате (event=payment_succeeded)
- Логирование завершения диагностики (event=diag_completed, codes=P0420;P0300)
- Алерт при критических ошибках OBD (event=critical_dtc, vin=..., dtc=P0xxx)

Безопасность: для прод включите токен и проверяйте его в n8n; источник — локальный агент (киоск).
