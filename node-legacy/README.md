# Node Legacy (Stage 2)

Каталог `node-legacy/` будет содержать проекты на Node.js/TypeScript, которые выводятся из основной системы. Код хранится только для справки и недоступен в продакшн-сборке.

## Статус переноса (2025-10-13)

- ✅ `apps/kiosk` → `node-legacy/apps/kiosk`
- ✅ `apps/kiosk-admin` → `node-legacy/apps/kiosk-admin`
- ✅ `apps-unified/kiosk-agent` → `node-legacy/apps-unified/kiosk-agent`
- ✅ `03-apps` → `node-legacy/03-apps`
- ✅ `04-packages` → `node-legacy/04-packages`
- ✅ `packages-unified` → `node-legacy/packages-unified`

Перед переносом оставшихся каталогов:

1. Выделить полезные артефакты (иконки, сертификаты, документы) и переместить их в целевые каталоги (`assets/`, `docs/`).
2. Обновить документацию, указав новое расположение архивного кода.
3. Убедиться, что CI/скрипты больше не ссылаются на Node-зависимости.
