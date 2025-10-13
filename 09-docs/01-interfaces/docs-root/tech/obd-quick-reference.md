# OBD-II Quick Reference Guide

Краткая справка для работы с расширенными возможностями OBD-II драйверов.

## Подключение с профилем

```typescript
import { obdConnectionManager } from './devices/obd/ObdConnectionManager.js';

// Toyota/Lexus с автоопределением порта
await obdConnectionManager.connect({
  transport: 'auto',
  protocolProfile: 'toyota_lexus'
});

// Honda с конкретным портом
await obdConnectionManager.connect({
  transport: 'serial',
  portPath: 'COM3',
  protocolProfile: 'honda'
});

// Ручное указание протокола (переопределяет профиль)
await obdConnectionManager.connect({
  transport: 'serial',
  portPath: '/dev/ttyUSB0',
  protocol: 'iso15765-4'
});
```

## Доступные профили

| Профиль | Описание | Приоритет протоколов |
|---------|----------|----------------------|
| `auto` | Универсальный (по умолчанию) | auto |
| `toyota_lexus` | Toyota, Lexus | iso15765-4, iso9141-2, kwp2000-5, kwp2000-f |
| `honda` | Honda, Acura | iso15765-4, kwp2000-f |
| `nissan` | Nissan, Infiniti | iso15765-4, kwp2000-f, iso9141-2 |
| `gm` | General Motors | iso15765-4, sae-j1850-v |
| `ford` | Ford, Lincoln, Mercury | iso15765-4, sae-j1850-p |
| `european` | VW, BMW, Mercedes и т.д. | iso15765-4, kwp2000-f, iso9141-2 |

## Доступные протоколы

| ID | Команда | Описание |
|----|---------|----------|
| `auto` | ATSP0 | Автоматическое определение |
| `iso15765-4` | ATSP6 | CAN 11bit 500kb |
| `iso15765-5` | ATSP7 | CAN 29bit 500kb |
| `iso9141-2` | ATSP3 | ISO 9141-2 (legacy) |
| `kwp2000-5` | ATSP4 | KWP2000 (5 baud init) |
| `kwp2000-f` | ATSP5 | KWP2000 (fast init) |
| `sae-j1850-p` | ATSP1 | SAE J1850 PWM |
| `sae-j1850-v` | ATSP2 | SAE J1850 VPW |

## API примеры

### Подключение

```bash
POST /api/obd/connect
Content-Type: application/json

{
  "transport": "serial",
  "protocolProfile": "toyota_lexus"
}
```

### Получение статуса с протоколом

```bash
GET /api/obd/snapshot
```

Ответ:
```json
{
  "ok": true,
  "snapshot": {
    "state": "connected",
    "transport": "serial",
    "portPath": "COM3",
    "baudRate": 38400,
    "identity": "ELM327 v1.5",
    "metrics": {
      "protocolUsed": "iso15765-4",
      "totalCommands": 15,
      "successfulCommands": 15
    }
  }
}
```

### Самопроверка

```bash
POST /api/obd/self-check
Content-Type: application/json

{
  "attempts": 3,
  "delayMs": 500
}
```

Ответ включает `metrics.protocolUsed`.

## Обработка ошибок

```typescript
try {
  await obdConnectionManager.connect({ protocolProfile: 'toyota_lexus' });
} catch (error) {
  // Детальные коды ошибок
  if (error.code === 'adapter_not_found') {
    console.log('Адаптер не найден');
  } else if (error.code === 'command_timeout') {
    console.log('Таймаут команды');
  } else if (error.message.includes('UNABLE TO CONNECT')) {
    console.log('Не удалось подключиться к автомобилю');
  }
}
```

## Метрики

Драйвер отслеживает:
- `protocolUsed` — фактически использованный протокол
- `totalCommands` — общее количество команд
- `successfulCommands` — успешные команды
- `failedCommands` — неудачные команды
- `timeouts` — количество таймаутов
- `averageLatencyMs` — средняя задержка

```typescript
const metrics = driver.getMetrics();
console.log(`Protocol: ${metrics.protocolUsed}`);
console.log(`Success rate: ${metrics.successfulCommands / metrics.totalCommands * 100}%`);
```

## Самопроверка с протоколом

```typescript
import { runObdSelfCheck } from './devices/obd/ObdSelfCheck.js';

const driver = await obdConnectionManager.getDriver();
const report = await runObdSelfCheck(driver, {
  attempts: 3,
  delayMs: 500
});

console.log(`Protocol used: ${report.metrics.protocolUsed}`);
console.log(`Passes: ${report.passes}/${report.attemptsPerformed}`);
```

## Troubleshooting

### Проблема: Не удаётся подключиться к Toyota

**Решение**: Убедитесь, что используете профиль `toyota_lexus`:
```typescript
await obdConnectionManager.connect({
  protocolProfile: 'toyota_lexus'
});
```

### Проблема: Таймауты команд

**Решение**: Увеличьте таймаут:
```typescript
await obdConnectionManager.connect({
  protocolProfile: 'toyota_lexus',
  timeoutMs: 3000 // вместо 2000 по умолчанию
});
```

### Проблема: UNABLE TO CONNECT на старом автомобиле

**Решение**: Попробуйте профиль с KWP2000 или ISO 9141-2:
```typescript
await obdConnectionManager.connect({
  protocol: 'iso9141-2' // или 'kwp2000-5'
});
```

### Проблема: Адаптер не найден

**Решение**: Проверьте список портов:
```bash
GET /api/serialports
```

Затем укажите порт явно:
```typescript
await obdConnectionManager.connect({
  portPath: 'COM3', // из списка портов
  protocolProfile: 'toyota_lexus'
});
```

## Дополнительная информация

- Полная документация: `docs/tech/obd-driver-enhancement.md`
- Исходный код: `apps/kiosk-agent/src/devices/obd/`
- Тесты: `apps/kiosk-agent/src/devices/obd/*.test.ts`
