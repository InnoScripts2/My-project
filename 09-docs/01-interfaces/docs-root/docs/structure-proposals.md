# Варианты единой структуры репозитория

Ниже приведены десять независимых схем, каждая из которых описывает цельную организацию проекта. Все пути заданы относительно корня репозитория.

## Вариант 1 — Mono Service Core
```
apps/
  kiosk/
    agent/
    frontend/
packages/
  devices/
    obd/
    thickness/
  services/
    payments/
    reports/
infra/
  scripts/
  docker/
docs/
  product/
  tech/
config/
  eslint/
  tsconfig/
```

## Вариант 2 — Layered Modules
```
source/
  application/
    agent/
    kiosk-ui/
  domain/
    diagnostics/
    thickness/
  infrastructure/
    payments/
    storage/
shared/
  lib/
  ui-components/
build/
  configs/
  pipelines/
docs/
  product/
  architecture/
```

## Вариант 3 — Product Streams
```
products/
  kiosk/
    app/
      frontend/
      backend/
    device-drivers/
  admin-portal/
    web/
    api/
platform/
  shared-packages/
  telemetry/
operations/
  deployment/
  monitoring/
knowledge-base/
  product/
  tech/
```

## Вариант 4 — Service + SDK
```
services/
  kiosk-agent/
  admin-service/
sdk/
  device-sdk/
    obd/
    thickness/
  client-sdk/
web/
  kiosk-ui/
  admin-ui/
platform/
  metrics/
  payments/
ops/
  scripts/
  pipelines/
docs/
  ux/
  technical/
```

## Вариант 5 — Runtime / Tooling Split
```
runtime/
  agent/
  frontend/
  automation/
modules/
  diagnostics/
  thickness/
  payments/
  reports/
assets/
  media/
  translations/
tooling/
  cli/
  testing/
  pipelines/
knowledge/
  product/
  architecture/
```

## Вариант 6 — Clean Architecture Emphasis
```
apps/
  kiosk/
    src/
      presentation/
      application/
      domain/
      infrastructure/
    public/
packages/
  shared/
    utils/
    types/
  device/
    obd/
    thickness/
platform/
  payments/
  reports/
  notifications/
ops/
  scripts/
  configs/
docs/
  handbook/
  reference/
```

## Вариант 7 — Device-first Layout
```
applications/
  kiosk-agent/
  kiosk-frontend/
  service-admin/
devices/
  obd/
  thickness/
  lock/
platform-modules/
  payments/
  reports/
  storage/
lib/
  core-utils/
  api-clients/
ops/
  deployment/
  monitoring/
docs/
  product/
  tech/
```

## Вариант 8 — Package Workspace
```
workspace/
  apps/
    kiosk-agent/
    kiosk-frontend/
  libs/
    device-obd/
    device-thickness/
    payments/
    reporting/
  tools/
    cli/
    testing/
  configs/
    eslint/
    tsconfig/
  docs/
    product/
    tech/
```

## Вариант 9 — Capabilities Matrix
```
capabilities/
  diagnostics/
    service/
    ui/
  thickness/
    service/
    ui/
  payments/
    service/
    sdk/
foundation/
  core/
  infrastructure/
  shared-ui/
operations/
  deploy/
  telemetry/
manuals/
  product/
  engineering/
```

## Вариант 10 — Minimalist Hybrid
```
apps/
  kiosk/
    agent/
    ui/
modules/
  device/
    obd/
    thickness/
  service/
    payments/
    reports/
shared/
  utils/
  config/
ops/
  build/
  deploy/
  scripts/
docs/
  overview/
  api/
```
 миииммии                                            ИМИ           ьлллллллллллллллллл
                  р р              \65куыцф