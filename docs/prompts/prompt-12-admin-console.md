# Промпт 12 админ-консоль оператора

ЦЕЛЬ
Реализовать web-based админ-панель для операторов и администраторов киосков через Vue 3 Composition API Ant Design Vue компоненты vue-element-admin шаблон dashboard, функции мониторинг киосков статус devices active sessions alerts, управление kiosk remote restart config update firmware, аналитика dashboards из промпта 11 sessions revenue errors trends, user management role-based access operator read-only admin full control, real-time updates WebSocket push notifications, responsive design desktop tablet. Цель: центральное управление fleet киосков, быстрый доступ к метрикам и контролям, автоматизация операций, снижение MTTR на инциденты.

КОНТЕКСТ
Промпты 1-11 генерируют данные и события: OBD диагностика, толщиномер замеры, платежи confirmations, отчеты доставка, мониторинг metrics alerts, безопасность audit logs, аналитика dashboards. Операторы нуждаются в unified interface для просмотра статусов киосков, реагирования на алерты, запуска операций restart update, анализа трендов performance и revenue. Без админ-панели операторы используют SSH logs raw metrics неудобно и долго, MTTR высокий. Решение: web-приложение Vue 3 на порту 8080 kiosk-agent, REST API backend уже реализован промптами 1-11 все endpoints /api/obd /api/thickness /api/payments /api/reports /api/monitoring /api/security /api/analytics, frontend консюмирует эти API и визуализирует. Ant Design Vue предоставляет готовые компоненты Table Card Chart Modal Notification для быстрого UI, vue-element-admin шаблон обеспечивает структуру layout sidebar menu router auth store. Real-time updates через WebSocket: kiosk-agent broadcast события session_started payment_confirmed alert_triggered device_disconnected, frontend обновляет UI без polling. Role-based access: operator видит dashboards может выполнять safe actions restart view logs, admin full access включая config changes user management firmware updates.

ГРАНИЦЫ
Внутри: Vue 3 frontend app компоненты Dashboard KioskList SessionsView PaymentsView AlertsView ConfigEditor, routing Vue Router pages views, state management Pinia stores для kiosks sessions alerts users, API client Axios или fetch для REST endpoints, WebSocket client для real-time events, authentication JWT bearer token stored в localStorage или sessionStorage, UI components Ant Design Vue ATable ACard AChart AModal ANotification, responsive CSS media queries для tablet. Вне: backend API реализация уже в промптах 1-11, deployment отдельный web server Nginx для frontend static files не требуется kiosk-agent serve через Express static middleware, mobile apps iOS Android native не поддерживаются только responsive web, complex data transformations ETL делается в backend. Интеграция: промпт 7 monitoring API /api/health /api/ready /metrics для kiosk status, промпт 8 security API /api/security/audit для logs, промпт 11 analytics API /api/analytics/dashboard для charts, промпт 2 OBD API /api/obd/status для device status, промпт 5 payments API /api/payments/intents для payment monitoring.

АРХИТЕКТУРА

КОМПОНЕНТ Dashboard
Файл apps/kiosk-admin/src/views/Dashboard.vue
Страница главная dashboard overview показывает агрегированные метрики:

- Карточки metrics: Total Sessions Total Revenue Active Kiosks Active Sessions
- График trendsChart: sessions и revenue last 30 days line chart
- Таблица topErrors: top 5 DTC codes с count и severity badge
- Список recentAlerts: последние 10 алертов с timestamp severity description
- Статусы activeDevices: OBD адаптер connected disconnected, толщиномер connected disconnected

Composition API setup:

```vue
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAnalyticsStore } from '@/stores/analytics';
import { useKiosksStore } from '@/stores/kiosks';
import { Card, Statistic, Table, Badge } from 'ant-design-vue';

const analyticsStore = useAnalyticsStore();
const kiosksStore = useKiosksStore();

onMounted(async () => {
  await analyticsStore.fetchOverviewDashboard();
  await kiosksStore.fetchKiosksList();
});

const totalSessions = computed(() => analyticsStore.overviewDashboard?.totalSessions || 0);
const totalRevenue = computed(() => analyticsStore.overviewDashboard?.totalRevenue || 0);
const activeKiosks = computed(() => kiosksStore.kiosks.filter(k => k.status === 'online').length);
</script>
```

Шаблон template:

```vue
<template>
  <div class="dashboard">
    <a-row :gutter="16">
      <a-col :span="6">
        <a-card>
          <a-statistic title="Total Sessions" :value="totalSessions" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="Total Revenue" :value="totalRevenue" prefix="₽" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="Active Kiosks" :value="activeKiosks" />
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="16" style="margin-top: 16px">
      <a-col :span="16">
        <a-card title="Sessions & Revenue Trends">
          <LineChart :data="trendsChartData" />
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card title="Top Errors">
          <a-table :dataSource="topErrors" :columns="errorColumns" :pagination="false" />
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>
```

КОМПОНЕНТ KioskList
Файл apps/kiosk-admin/src/views/KioskList.vue
Страница список киосков fleet management:

- Таблица kiosks: ID Location Status Uptime LastSeen Actions
- Колонка Status: badge online offline maintenance
- Колонка Actions: кнопки Restart View Logs Configure
- Фильтры: по статусу online offline, по локации dropdown
- Search: по ID или location

Логика fetchKiosksList:

```typescript
// apps/kiosk-admin/src/stores/kiosks.ts
import { defineStore } from 'pinia';
import axios from 'axios';

export const useKiosksStore = defineStore('kiosks', {
  state: () => ({
    kiosks: [] as Kiosk[],
    loading: false
  }),
  actions: {
    async fetchKiosksList() {
      this.loading = true;
      const response = await axios.get('/api/kiosks');
      this.kiosks = response.data;
      this.loading = false;
    },
    async restartKiosk(kioskId: string) {
      await axios.post(`/api/kiosks/${kioskId}/restart`);
      await this.fetchKiosksList();
    }
  }
});
```

Actions handlers:

- Restart: вызывает POST /api/kiosks/:id/restart, показывает notification успех, обновляет статус kiosk
- View Logs: открывает модал LogsViewer с запросом GET /api/kiosks/:id/logs
- Configure: переход на страницу ConfigEditor с kioskId параметром

КОМПОНЕНТ SessionsView
Файл apps/kiosk-admin/src/views/SessionsView.vue
Страница sessions management:

- Таблица sessions: SessionID Type Status StartedAt Duration Client Actions
- Колонка Type: THICKNESS DIAGNOSTICS
- Колонка Status: in-progress completed incomplete failed
- Фильтры: date range picker startDate endDate, type dropdown, status dropdown
- Actions: View Details Cancel Session если in-progress

Логика fetchSessions:

```typescript
// apps/kiosk-admin/src/stores/sessions.ts
import { defineStore } from 'pinia';
import axios from 'axios';

export const useSessionsStore = defineStore('sessions', {
  state: () => ({
    sessions: [] as Session[],
    loading: false,
    filters: { startDate: '', endDate: '', type: '', status: '' }
  }),
  actions: {
    async fetchSessions() {
      this.loading = true;
      const response = await axios.get('/api/sessions', { params: this.filters });
      this.sessions = response.data;
      this.loading = false;
    }
  }
});
```

View Details modal: показывает детали сессии OBD DTC коды если DIAGNOSTICS, толщиномер measurements если THICKNESS, payment status, report delivery status

КОМПОНЕНТ AlertsView
Файл apps/kiosk-admin/src/views/AlertsView.vue
Страница алерты мониторинг:

- Таблица alerts: Timestamp Severity Name Description Status Actions
- Колонка Severity: badge critical warning info
- Колонка Status: active resolved acknowledged
- Фильтры: severity dropdown, status dropdown, date range
- Actions: Acknowledge Resolve

Логика fetchAlerts:

```typescript
// apps/kiosk-admin/src/stores/alerts.ts
import { defineStore } from 'pinia';
import axios from 'axios';

export const useAlertsStore = defineStore('alerts', {
  state: () => ({
    alerts: [] as Alert[],
    unacknowledgedCount: 0
  }),
  actions: {
    async fetchAlerts() {
      const response = await axios.get('/api/monitoring/alerts');
      this.alerts = response.data;
      this.unacknowledgedCount = this.alerts.filter(a => a.status === 'active').length;
    },
    async acknowledgeAlert(alertId: string) {
      await axios.post(`/api/monitoring/alerts/${alertId}/acknowledge`);
      await this.fetchAlerts();
    }
  }
});
```

Actions handlers:

- Acknowledge: устанавливает status acknowledged, показывает notification, badge severity меняется на secondary
- Resolve: устанавливает status resolved, алерт скрывается из активных по умолчанию но доступен в фильтре resolved

КОМПОНЕНТ ConfigEditor
Файл apps/kiosk-admin/src/views/ConfigEditor.vue
Страница редактирование конфигурации киоска:

- Форма config settings: OBD адаптер port baud rate, толщиномер BLE device ID, платежи YooKassa shop ID API key, email SMTP credentials
- Секции collapsible: Devices Payments Reports Monitoring
- Валидация: required fields format checks email SMTP test connection
- Actions: Save Changes Discard Reset to Default

Логика saveConfig:

```typescript
// apps/kiosk-admin/src/stores/config.ts
import { defineStore } from 'pinia';
import axios from 'axios';

export const useConfigStore = defineStore('config', {
  state: () => ({
    config: {} as KioskConfig,
    loading: false
  }),
  actions: {
    async fetchConfig(kioskId: string) {
      this.loading = true;
      const response = await axios.get(`/api/kiosks/${kioskId}/config`);
      this.config = response.data;
      this.loading = false;
    },
    async saveConfig(kioskId: string, newConfig: KioskConfig) {
      await axios.put(`/api/kiosks/${kioskId}/config`, newConfig);
      this.config = newConfig;
    }
  }
});
```

Валидация форма Ant Design Form:

```vue
<a-form :model="configForm" :rules="configRules" @finish="onSaveConfig">
  <a-form-item label="OBD Port" name="obdPort">
    <a-input v-model:value="configForm.obdPort" />
  </a-form-item>
  <a-form-item label="SMTP Host" name="smtpHost">
    <a-input v-model:value="configForm.smtpHost" />
  </a-form-item>
  <a-form-item>
    <a-button type="primary" html-type="submit">Save Changes</a-button>
  </a-form-item>
</a-form>
```

МОДУЛЬ WebSocketClient
Файл apps/kiosk-admin/src/services/WebSocketClient.ts
Класс WebSocketClient методы:

- connect url string returns void
- disconnect returns void
- subscribe event string callback function returns void
- unsubscribe event string callback function returns void

События от backend:

- session_started payload {sessionId, type, kioskId, startedAt}
- payment_confirmed payload {paymentId, sessionId, amount}
- alert_triggered payload {alertId, severity, name, description}
- device_disconnected payload {device, kioskId}
- kiosk_status_changed payload {kioskId, status}

Логика subscribe:

```typescript
import { io, Socket } from 'socket.io-client';

export class WebSocketClient {
  private socket: Socket | null = null;

  connect(url: string) {
    this.socket = io(url, { transports: ['websocket'] });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
  }

  subscribe(event: string, callback: (data: any) => void) {
    if (!this.socket) return;
    this.socket.on(event, callback);
  }

  unsubscribe(event: string, callback: (data: any) => void) {
    if (!this.socket) return;
    this.socket.off(event, callback);
  }
}
```

Интеграция в stores:

```typescript
// apps/kiosk-admin/src/stores/realtime.ts
import { defineStore } from 'pinia';
import { WebSocketClient } from '@/services/WebSocketClient';
import { useKiosksStore } from './kiosks';
import { useAlertsStore } from './alerts';

export const useRealtimeStore = defineStore('realtime', {
  state: () => ({
    wsClient: new WebSocketClient()
  }),
  actions: {
    initWebSocket() {
      this.wsClient.connect('ws://localhost:8080');

      this.wsClient.subscribe('alert_triggered', (data) => {
        const alertsStore = useAlertsStore();
        alertsStore.addAlert(data);
      });

      this.wsClient.subscribe('kiosk_status_changed', (data) => {
        const kiosksStore = useKiosksStore();
        kiosksStore.updateKioskStatus(data.kioskId, data.status);
      });
    }
  }
});
```

МОДУЛЬ AuthService
Файл apps/kiosk-admin/src/services/AuthService.ts
Класс AuthService методы:

- login username string password string returns Promise LoginResult
- logout returns void
- isAuthenticated returns boolean
- getToken returns string or null
- getUserRole returns operator or admin or null

LoginResult interface:

- success boolean
- token string JWT bearer token
- user object {id, username, role}
- expiresAt number timestamp

Логика login:

```typescript
export class AuthService {
  async login(username: string, password: string): Promise<LoginResult> {
    const response = await axios.post('/api/auth/login', { username, password });
    const { token, user, expiresAt } = response.data;

    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_role', user.role);

    return { success: true, token, user, expiresAt };
  }

  logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_role');
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem('auth_token');
    return token !== null;
  }

  getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  getUserRole(): 'operator' | 'admin' | null {
    return localStorage.getItem('user_role') as 'operator' | 'admin' | null;
  }
}
```

Axios interceptor для bearer token:

```typescript
import axios from 'axios';
import { AuthService } from './AuthService';

const authService = new AuthService();

axios.interceptors.request.use((config) => {
  const token = authService.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

КОМПОНЕНТ LoginPage
Файл apps/kiosk-admin/src/views/LoginPage.vue
Страница аутентификация:

- Форма login: поля Username Password
- Кнопка Submit
- Обработчик onLogin: вызывает AuthService.login, при успехе redirect на Dashboard, при ошибке показывает notification

Template:

```vue
<template>
  <div class="login-page">
    <a-card title="Admin Console Login">
      <a-form @finish="onLogin">
        <a-form-item label="Username" name="username">
          <a-input v-model:value="loginForm.username" />
        </a-form-item>
        <a-form-item label="Password" name="password">
          <a-input-password v-model:value="loginForm.password" />
        </a-form-item>
        <a-form-item>
          <a-button type="primary" html-type="submit">Login</a-button>
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { AuthService } from '@/services/AuthService';
import { notification } from 'ant-design-vue';

const router = useRouter();
const authService = new AuthService();
const loginForm = ref({ username: '', password: '' });

async function onLogin() {
  try {
    const result = await authService.login(loginForm.value.username, loginForm.value.password);
    if (result.success) {
      notification.success({ message: 'Login successful' });
      router.push('/dashboard');
    }
  } catch (error) {
    notification.error({ message: 'Login failed', description: error.message });
  }
}
</script>
```

РОУТИНГ
Файл apps/kiosk-admin/src/router/index.ts
Vue Router конфигурация:

```typescript
import { createRouter, createWebHistory } from 'vue-router';
import { AuthService } from '@/services/AuthService';

const authService = new AuthService();

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/views/LoginPage.vue') },
  { path: '/dashboard', name: 'Dashboard', component: () => import('@/views/Dashboard.vue'), meta: { requiresAuth: true } },
  { path: '/kiosks', name: 'KioskList', component: () => import('@/views/KioskList.vue'), meta: { requiresAuth: true } },
  { path: '/sessions', name: 'SessionsView', component: () => import('@/views/SessionsView.vue'), meta: { requiresAuth: true } },
  { path: '/alerts', name: 'AlertsView', component: () => import('@/views/AlertsView.vue'), meta: { requiresAuth: true } },
  { path: '/config/:kioskId', name: 'ConfigEditor', component: () => import('@/views/ConfigEditor.vue'), meta: { requiresAuth: true, requiresAdmin: true } }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const requiresAuth = to.meta.requiresAuth;
  const requiresAdmin = to.meta.requiresAdmin;
  const isAuthenticated = authService.isAuthenticated();
  const userRole = authService.getUserRole();

  if (requiresAuth && !isAuthenticated) {
    next('/login');
  } else if (requiresAdmin && userRole !== 'admin') {
    notification.error({ message: 'Access denied', description: 'Admin role required' });
    next('/dashboard');
  } else {
    next();
  }
});

export default router;
```

LAYOUT
Файл apps/kiosk-admin/src/layouts/MainLayout.vue
Главный layout sidebar menu:

```vue
<template>
  <a-layout style="min-height: 100vh">
    <a-layout-sider v-model:collapsed="collapsed" collapsible>
      <div class="logo">Admin Console</div>
      <a-menu v-model:selectedKeys="selectedKeys" theme="dark" mode="inline">
        <a-menu-item key="dashboard">
          <router-link to="/dashboard">Dashboard</router-link>
        </a-menu-item>
        <a-menu-item key="kiosks">
          <router-link to="/kiosks">Kiosks</router-link>
        </a-menu-item>
        <a-menu-item key="sessions">
          <router-link to="/sessions">Sessions</router-link>
        </a-menu-item>
        <a-menu-item key="alerts">
          <router-link to="/alerts">
            Alerts <a-badge :count="unacknowledgedAlertsCount" />
          </router-link>
        </a-menu-item>
      </a-menu>
    </a-layout-sider>

    <a-layout>
      <a-layout-header style="background: #fff; padding: 0">
        <a-button @click="onLogout">Logout</a-button>
      </a-layout-header>
      <a-layout-content style="margin: 16px">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>
```

REST API BACKEND

GET /api/kiosks
Список киосков
Ответ: 200 OK application/json

```json
[
  {"kioskId": "kiosk-001", "location": "Moscow Center", "status": "online", "uptime": 86400, "lastSeen": "2025-01-15T12:00:00Z"}
]
```

POST /api/kiosks/:id/restart
Restart киоск
Ответ: 200 OK

GET /api/kiosks/:id/logs
Получить логи киоска
Query params: limit offset
Ответ: 200 OK application/json

```json
{
  "logs": [
    {"timestamp": "2025-01-15T12:00:00Z", "level": "info", "message": "Session started"}
  ]
}
```

GET /api/kiosks/:id/config
Получить конфигурацию
Ответ: 200 OK application/json

```json
{
  "obdPort": "COM3",
  "obdBaudRate": 38400,
  "thicknessDeviceId": "AA:BB:CC:DD:EE:FF",
  "yookassaShopId": "12345",
  "smtpHost": "smtp.example.com"
}
```

PUT /api/kiosks/:id/config
Обновить конфигурацию
Запрос: application/json
Ответ: 200 OK

POST /api/auth/login
Аутентификация
Запрос: application/json {username, password}
Ответ: 200 OK application/json

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {"id": "1", "username": "operator1", "role": "operator"},
  "expiresAt": 1737801600
}
```

ТЕСТЫ

Юнит-тесты apps/kiosk-admin/tests/unit/

- stores/kiosks.test.ts: fetchKiosksList заполняет kiosks array, restartKiosk вызывает API и обновляет статус
- stores/alerts.test.ts: fetchAlerts заполняет alerts, acknowledgeAlert обновляет status acknowledged
- services/AuthService.test.ts: login сохраняет token в localStorage, isAuthenticated возвращает true если token существует, getUserRole возвращает корректную роль

Интеграционные тесты apps/kiosk-admin/tests/integration/

- api-integration.test.ts: GET /api/kiosks возвращает список, POST /api/kiosks/:id/restart успешно выполняется, GET /api/kiosks/:id/config возвращает конфигурацию
- websocket-integration.test.ts: WebSocket connection устанавливается, subscribe на alert_triggered получает события, unsubscribe отключает callback

E2E тесты apps/kiosk-admin/tests/e2e/

- login-flow.test.ts: открыть LoginPage, ввести username password, submit, проверить redirect на Dashboard, проверить localStorage содержит auth_token
- dashboard-flow.test.ts: открыть Dashboard, проверить карточки Total Sessions Total Revenue отображаются, график trendsChart загружается, таблица topErrors заполнена
- kiosk-management.test.ts: открыть KioskList, фильтр по status online, click Restart на kiosk-001, проверить notification success, проверить статус updated
- alerts-management.test.ts: открыть AlertsView, проверить unacknowledged badge count, click Acknowledge на алерт, проверить status changed и badge decremented

ДОКУМЕНТАЦИЯ

README apps/kiosk-admin/README.md
Секции:

- Обзор: админ-панель для операторов fleet киосков, Vue 3 Ant Design vue-element-admin
- Features: Dashboard мониторинг, Kiosks управление, Sessions просмотр, Alerts реагирование, Config редактирование, Real-time WebSocket updates, Role-based access
- Tech Stack: Vue 3 Composition API, Ant Design Vue, Pinia state management, Vue Router, Socket.IO WebSocket, Axios HTTP client
- Development: npm run dev запуск dev server port 5173, proxy API requests на localhost:8080, hot reload
- Deployment: npm run build компиляция в dist/, serve через kiosk-agent Express static middleware
- Authentication: JWT bearer token, localStorage storage, Axios interceptor
- Roles: operator read-only dashboards sessions alerts, admin full access config user-management firmware
- Troubleshooting: WebSocket connection failed проверить kiosk-agent WebSocket server, API 401 unauthorized проверить token expired re-login, chart не загружается проверить analytics API /api/analytics/dashboard

ПРИМЕРЫ

Пример инициализация приложения

```typescript
// apps/kiosk-admin/src/main.ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Antd from 'ant-design-vue';
import App from './App.vue';
import router from './router';
import 'ant-design-vue/dist/reset.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(Antd);

app.mount('#app');
```

Пример использование Pinia store в компоненте

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useKiosksStore } from '@/stores/kiosks';

const kiosksStore = useKiosksStore();

onMounted(async () => {
  await kiosksStore.fetchKiosksList();
});
</script>

<template>
  <a-table :dataSource="kiosksStore.kiosks" :loading="kiosksStore.loading" />
</template>
```

Пример WebSocket subscription в component

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRealtimeStore } from '@/stores/realtime';

const realtimeStore = useRealtimeStore();

onMounted(() => {
  realtimeStore.initWebSocket();
});

onUnmounted(() => {
  realtimeStore.wsClient.disconnect();
});
</script>
```

КОНФИГУРАЦИЯ

ENV переменные apps/kiosk-admin/.env

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080
```

Vite config apps/kiosk-admin/vite.config.ts

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
});
```

БЕЗОПАСНОСТЬ

JWT token: хранится в localStorage экспонирован XSS атакам. Решение: использовать httpOnly cookies для token storage, или sessionStorage для временного хранения
CORS: kiosk-agent backend должен настроить CORS headers для admin-console origin. Решение: Express CORS middleware allow origin http://localhost:5173 в DEV, production domain в PROD
Role-based access: проверка роли в frontend router guards недостаточна. Решение: backend API endpoints также проверяют роль через JWT claims, operator не может вызывать PUT /api/kiosks/:id/config
WebSocket auth: WebSocket connection без auth может получать события. Решение: передать token в handshake query param или auth header, server валидирует перед connection accept

МЕТРИКИ

admin_console_page_views_total counter labels page dashboard|kiosks|sessions|alerts: количество просмотров страниц
admin_console_api_requests_total counter labels endpoint method status: количество API запросов из frontend
admin_console_websocket_connections_active gauge: количество активных WebSocket connections
admin_console_user_sessions_active gauge: количество активных пользовательских сессий
admin_console_action_executions_total counter labels action restart|acknowledge|configure: количество выполненных actions

РИСКИ

Frontend bundle size: Vue 3 Ant Design большие библиотеки bundle >1MB. Решение: code splitting lazy load routes components, tree shaking unused Ant Design components, Vite build optimization
WebSocket reconnection: потеря connection приводит к missed events. Решение: автоматический reconnect с exponential backoff, re-subscribe на события после reconnect, показывать notification disconnected в UI
Stale data: cached data в Pinia stores может быть устаревшими. Решение: periodic polling refresh каждые 30s для критичных данных kiosks alerts, или rely на WebSocket updates для real-time
Role privilege escalation: operator модифицирует localStorage user_role на admin. Решение: backend всегда проверяет роль через JWT claims игнорирует frontend role, frontend role только для UI visibility

ROADMAP

Фаза 1: Базовый frontend Dashboard KioskList 1 неделя
Задачи: Vue 3 проект setup Vite Ant Design, Dashboard компонент cards charts, KioskList таблица с filters, routing auth login, Pinia stores kiosks analytics, API client Axios
Критерии: Dashboard показывает metrics и charts, KioskList загружает kiosks и фильтрует, login работает JWT token stored

Фаза 2: Sessions Alerts управление 1 неделя
Задачи: SessionsView компонент таблица filters view details modal, AlertsView компонент таблица acknowledge resolve actions, WebSocketClient integration real-time alerts, notifications toast
Критерии: SessionsView показывает sessions с фильтрацией, AlertsView показывает alerts с actions, WebSocket получает events и обновляет UI

Фаза 3: Config management role-based access 1 неделя
Задачи: ConfigEditor компонент форма validation save, role-based routing guards operator vs admin, user management page list create edit delete users, deployment build serve через kiosk-agent, E2E тесты, документация
Критерии: ConfigEditor сохраняет конфигурацию, operator не может открыть config страницу, admin может управлять users, build dist/ serve статически, E2E тесты проходят

КРИТЕРИИ ACCEPTANCE

1. Dashboard компонент отображает карточки Total Sessions Total Revenue Active Kiosks и график trendsChart
2. KioskList компонент загружает kiosks таблицу с filters и actions Restart View Logs Configure
3. SessionsView компонент показывает sessions с фильтрацией по date type status и view details modal
4. AlertsView компонент отображает alerts с actions Acknowledge Resolve и unacknowledged badge
5. ConfigEditor компонент позволяет редактировать kiosk config с validation и save
6. WebSocketClient подключается к backend и subscribe на события alert_triggered kiosk_status_changed
7. AuthService реализует login logout isAuthenticated getUserRole с JWT token в localStorage
8. Vue Router настроен с guards requiresAuth requiresAdmin для role-based access
9. Pinia stores kiosks sessions alerts config реализованы с actions fetchKiosksList restartKiosk acknowledgeAlert saveConfig
10. Юнит-тесты stores services покрытие >80%
11. Интеграционные тесты api-integration websocket-integration проходят
12. E2E тесты login-flow dashboard-flow kiosk-management alerts-management проходят
13. Build dist/ выполняется без ошибок, serve через kiosk-agent Express static middleware
14. Responsive design desktop tablet через CSS media queries

ИТОГ

Промпт 12 добавляет web-based админ-панель Vue 3 Ant Design для операторов fleet киосков. Dashboard предоставляет overview metrics и charts из промпта 11 аналитики, KioskList управляет киосками restart logs config, SessionsView и AlertsView мониторят sessions и alerts из промптов 1-7, ConfigEditor редактирует kiosk config, WebSocketClient обеспечивает real-time updates через Socket.IO, AuthService реализует JWT authentication с role-based access operator vs admin. Интеграция с промптами 1-11 backend API endpoints позволяет unified interface для всех операций управления fleet. Deployment через kiosk-agent Express static middleware служит frontend bundle без отдельного web server.
