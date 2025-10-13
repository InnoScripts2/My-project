# Security Tests — Тесты безопасности

Эта директория содержит артефакты для тестирования и верификации безопасности системы.

## Файлы

### `manual-verification-checklist.md`
Подробный чеклист для ручной проверки безопасности перед production deployment:
- 88+ пунктов проверки
- 12 категорий (ключи, RLS, авторизация, TLS, логирование и т.д.)
- Команды для проверки
- Шаблон отчёта

## Типы тестов

### 1. Manual Verification (Ручная проверка)
**Файл:** `manual-verification-checklist.md`

**Когда использовать:**
- Перед каждым production deployment
- После критичных security изменений
- Регулярные аудиты (ежемесячно)

**Ответственные:** Security Lead, QA Lead

### 2. Automated Security Tests (Автоматизированные)
**Статус:** Планируется

Будущие артефакты:
- `security-tests.spec.ts` — юнит-тесты для security functions
- `penetration-tests/` — сценарии pen-testing
- `fuzz-tests/` — fuzzing для API endpoints

### 3. Compliance Tests (Соответствие стандартам)
**Статус:** Планируется

Будущие артефакты:
- `pci-dss-checklist.md` — проверка PCI DSS compliance
- `gdpr-checklist.md` — проверка GDPR compliance (если применимо)

## Процесс верификации

### Перед production deployment

1. **Pre-deployment check** (за 24 часа до деплоя):
   - Запустить `manual-verification-checklist.md`
   - Задокументировать все findings
   - Создать issues для критичных проблем

2. **Go/No-Go decision** (за 2 часа до деплоя):
   - Review чеклиста с Security Lead
   - Критичные находки должны быть исправлены
   - Non-critical могут быть postponed с планом устранения

3. **Post-deployment validation** (в течение 1 часа после деплоя):
   - Smoke test security endpoints
   - Проверить metrics/alerts
   - Подтвердить, что RLS policies active

### Регулярные аудиты

**Частота:** Ежемесячно

**Объём:** Полный чеклист из `manual-verification-checklist.md`

**Отчётность:** Отправить отчёт Security Lead и Tech Lead

## Интеграция с CI/CD

### Automated checks (текущие)

```bash
# npm audit для зависимостей
npm audit --audit-level=high

# Secrets scanning (TruffleHog)
trufflehog git file://. --since-commit HEAD~1

# Linting
npm run lint
```

### Future automated checks

- SAST (Static Application Security Testing) — CodeQL, Snyk
- DAST (Dynamic Application Security Testing) — OWASP ZAP
- Container scanning — Trivy, Clair
- Dependency scanning — Dependabot

## Инструменты

### Рекомендуемые инструменты

- **SSL/TLS:** [SSL Labs](https://www.ssllabs.com/ssltest/)
- **Headers:** [Security Headers](https://securityheaders.com/)
- **CSP:** [CSP Evaluator](https://csp-evaluator.withgoogle.com/)
- **Secrets:** [TruffleHog](https://github.com/trufflesecurity/trufflehog)
- **Dependencies:** [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- **SAST:** [CodeQL](https://codeql.github.com/)
- **DAST:** [OWASP ZAP](https://www.zaproxy.org/)

## Документирование находок

### Severity Levels

- **Critical:** Немедленная угроза безопасности, блокирует deployment
- **High:** Серьёзная проблема, должна быть исправлена до next deployment
- **Medium:** Проблема средней важности, планируется в следующем sprint
- **Low:** Минор, можно postpone с согласованием Security Lead

### Issue Template

```markdown
## Security Finding

**Severity:** [Critical/High/Medium/Low]
**Category:** [Authentication/Authorization/Data Protection/etc.]
**Found by:** [Name]
**Date:** YYYY-MM-DD

### Description
[Описание проблемы]

### Impact
[Влияние на безопасность]

### Reproduction Steps
1. ...
2. ...

### Remediation
[Как исправить]

### References
- Checklist item: [ID]
- STRIDE threat: [ID]
```

## Связанные документы

- `08-security/01-interfaces/policies/` — политики для проверки
- `08-security/03-domain/threat-model/` — модель угроз для context
- `09-docs/01-interfaces/docs-root/tech/CYCLE2_SECURITY_GUIDE.md` — reference guide
