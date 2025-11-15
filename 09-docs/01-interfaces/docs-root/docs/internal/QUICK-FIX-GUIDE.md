# Критические проблемы и немедленные действия

## Проблема 1: Сборка приложения (0.1 МБ)

### Причина
TypeScript компилирует только ваш код без зависимостей. Приложение НЕ РАБОТАЕТ без node_modules.

### Немедленное решение

```bash
cd apps/kiosk-agent

# Текущая сборка создаёт только .js файлы
npm run build

# ❌ НЕПРАВИЛЬНО: node dist/index.js (не запустится - нет зависимостей)

# ✅ ПРАВИЛЬНО: Запуск с зависимостями
node dist/index.js  # Работает только если node_modules рядом
```

### Правильный размер приложения
- **С зависимостями:** 300-400 МБ (dist/ + node_modules/)
- **Standalone .exe:** 50-80 МБ (с pkg)
- **Текущий:** 0.1 МБ (НЕ работает)

---

## Проблема 2: Bluetooth адаптер не обнаруживается

### Критические причины

#### 1. Отсутствует пакет Bluetooth

```bash
cd apps/kiosk-agent

# Установить Bluetooth библиотеку
npm install @abandonware/bluetooth-serial-port --save

# Установить socket.io (тоже отсутствует)
npm install socket.io --save
```

#### 2. Нужны build tools для Windows

```bash
# От администратора
npm install --global windows-build-tools

# Или скачать вручную:
# Visual Studio 2022 Build Tools
# https://visualstudio.microsoft.com/downloads/
```

#### 3. Пересобрать нативные модули

```bash
cd apps/kiosk-agent
npm rebuild
```

---

## План действий (по приоритету)

### Шаг 1: Исправить Bluetooth (30 минут)

```bash
# В PowerShell от администратора
cd "C:\Users\Alexsey\Desktop\Новая папка (3)\apps\kiosk-agent"

# Установить пакеты
npm install @abandonware/bluetooth-serial-port socket.io --save

# Пересобрать
npm rebuild

# Проверить
npm list | Select-String "bluetooth"
```

**Ожидаемый результат:**
```
├── @abandonware/bluetooth-serial-port@2.2.3
```

### Шаг 2: Тестировать Bluetooth (10 минут)

```bash
# Запустить агент
npm run dev

# В другом терминале
curl http://localhost:7070/api/obd/connect -X POST -H "Content-Type: application/json" -d '{"transport":"bluetooth"}'
```

**Если ошибка "module not found":**
- Проверить установку build tools
- Запустить от администратора
- Включить Bluetooth service: `net start bthserv`

### Шаг 3: Правильная сборка для развертывания (1 час)

**Вариант A: С node_modules (рекомендуется)**

```bash
# На продакшн киоске
cd apps/kiosk-agent
npm ci --production     # Установить только production зависимости
npm run build           # Собрать TypeScript
node dist/index.js      # Запустить

# Размер: ~300-400 МБ
```

**Вариант B: Standalone .exe**

```bash
# Установить pkg
npm install -g pkg

# Добавить в package.json:
{
  "bin": "dist/index.js",
  "pkg": {
    "targets": ["node20-win-x64"]
  }
}

# Собрать
npm run build
pkg . --out-path bin

# Результат: bin/kiosk-agent.exe (~50-80 МБ)
```

### Шаг 4: Улучшить UI для Bluetooth (2 часа)

Добавить в фронтенд:
- Кнопка "Сканировать Bluetooth"
- Список найденных устройств
- Кнопка подключения к выбранному устройству
- Индикатор прогресса сканирования

---

## Быстрая проверка прямо сейчас

### 1. Проверить службу Bluetooth

```powershell
Get-Service bthserv

# Если остановлена:
net start bthserv
```

### 2. Список Bluetooth устройств Windows

```powershell
Get-PnpDevice -Class Bluetooth | Where-Object {$_.Status -eq "OK"}
```

### 3. Проверить пакеты Node

```bash
cd apps/kiosk-agent
npm list @abandonware/bluetooth-serial-port
npm list socket.io
```

**Если "UNMET DEPENDENCY" - установить сейчас:**

```bash
npm install @abandonware/bluetooth-serial-port socket.io --save
npm rebuild
```

---

## Ожидаемые результаты

### После установки Bluetooth пакета

**Агент при запуске:**
```
[kiosk-agent] listening on http://localhost:7070
[bluetooth-auto-detect] Starting device discovery...
[bluetooth-auto-detect] Found device: OBD-II (00:1A:2B:3C:4D:5E)
[bluetooth-auto-detect] Found device: ELM327 (00:11:22:33:44:55)
[bluetooth-auto-detect] Discovery complete: 2 devices found
```

**API ответ:**
```json
{
  "ok": true,
  "devices": [
    {
      "address": "00:1A:2B:3C:4D:5E",
      "name": "OBD-II"
    },
    {
      "address": "00:11:22:33:44:55",
      "name": "ELM327"
    }
  ]
}
```

### После правильной сборки

**Development:**
```
apps/kiosk-agent/
├── dist/           # 0.1 МБ (ваш код)
├── node_modules/   # 300 МБ (зависимости)
└── config/
Итого: ~300-400 МБ
```

**Production (pkg):**
```
bin/
└── kiosk-agent.exe  # 50-80 МБ (всё включено)
```

---

## Часто задаваемые вопросы

### Q: Почему репозиторий 6 ГБ?

**A:** Дублирование:
- Множество `node_modules/` папок
- `вспомогательные ресурсы/` (1+ ГБ GitHub репозиториев)
- `доп ресурсы/` (APK файлы)
- Старая и новая структура (`apps/` и `03-apps/`)

### Q: Можно ли уменьшить размер репозитория?

**A:** Да:
```bash
# Удалить старую структуру
rm -rf 03-apps/ 02-domains/ 04-packages/

# Удалить вспомогательные ресурсы
rm -rf "вспомогательные ресурсы/" "доп ресурсы/"

# Добавить в .gitignore
echo "node_modules/" >> .gitignore
echo "dist/" >> .gitignore
echo "**/build/" >> .gitignore

# Очистить git кэш
git rm -r --cached .
git add .
git commit -m "Cleanup: remove duplicates and large files"
```

**Результат:** Репозиторий ~100-200 МБ

### Q: Почему адаптер не виден даже после установки пакета?

**A:** Возможные причины:
1. Windows Bluetooth выключен
2. Адаптер не сопряжён через Settings
3. Нужны права администратора
4. Адаптер использует BLE вместо Classic Bluetooth
5. Драйвер адаптера не установлен

**Решение:**
- Сопрячь адаптер через Settings → Bluetooth
- Запустить агент от администратора
- Проверить Device Manager: есть ли "Bluetooth" устройства

### Q: Как сделать standalone .exe без установки Node?

**A:** Использовать **pkg**:
```bash
npm install -g pkg
pkg . --targets node20-win-x64 --out-path bin
```

Результат: `bin/kiosk-agent.exe` - один файл, не требует Node.js

---

## Следующие шаги

1. **Сейчас:** Установить Bluetooth пакеты
2. **Сегодня:** Протестировать обнаружение адаптера
3. **Завтра:** Настроить правильную сборку (pkg)
4. **На неделе:** Добавить UI выбора Bluetooth устройств

