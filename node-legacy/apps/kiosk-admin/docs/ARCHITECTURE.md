# Admin Console Architecture

## Overview

The Admin Console is a web-based application built with Vue 3 that provides operators and administrators with a centralized interface for managing a fleet of kiosks. It enables monitoring, configuration, and troubleshooting of kiosks through a responsive and real-time interface.

## Technology Stack

### Frontend
- **Vue 3** - Progressive JavaScript framework with Composition API
- **Ant Design Vue 4** - Enterprise-class UI components
- **Pinia** - State management library
- **Vue Router** - Official router for Vue.js
- **Axios** - HTTP client
- **Socket.IO Client** - Real-time bidirectional communication
- **TypeScript** - Type-safe development
- **Vite** - Next-generation frontend build tool

### Backend Integration
- **Express.js** - Web framework (kiosk-agent)
- **Socket.IO Server** - Real-time event broadcasting
- **REST API** - Standard HTTP endpoints for CRUD operations

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Admin Console (Vue 3 SPA)                │  │
│  │                                                        │  │
│  │  ┌──────────┐  ┌─────────┐  ┌──────────┐            │  │
│  │  │  Views   │  │ Stores  │  │ Services │            │  │
│  │  │ (Pages)  │─▶│ (Pinia) │◀─│ (API)    │            │  │
│  │  └──────────┘  └─────────┘  └──────────┘            │  │
│  │                      │             │                  │  │
│  │                      │             │                  │  │
│  └──────────────────────┼─────────────┼──────────────────┘  │
└─────────────────────────┼─────────────┼─────────────────────┘
                          │             │
                   WebSocket          HTTP
                          │             │
┌─────────────────────────┼─────────────┼─────────────────────┐
│              Kiosk Agent (Backend)    │                      │
│  ┌────────────────────┐  ┌────────────────────────┐         │
│  │  Socket.IO Server  │  │  REST API Routes       │         │
│  │  (Admin WS)        │  │  /api/kiosks          │         │
│  └────────────────────┘  │  /api/sessions        │         │
│           │               │  /api/monitoring      │         │
│           │               │  /api/analytics       │         │
│           │               │  /api/auth            │         │
│           │               └────────────────────────┘         │
│           │                          │                       │
│  ┌────────▼──────────────────────────▼──────────────────┐   │
│  │              Business Logic Layer                    │   │
│  │  (Device Managers, Session Managers, Monitoring)     │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
apps/kiosk-admin/
├── src/
│   ├── views/              # Page components
│   │   ├── Dashboard.vue
│   │   ├── KioskList.vue
│   │   ├── SessionsView.vue
│   │   ├── AlertsView.vue
│   │   ├── ConfigEditor.vue
│   │   └── LoginPage.vue
│   ├── layouts/            # Layout components
│   │   └── MainLayout.vue
│   ├── stores/             # Pinia stores
│   │   ├── kiosks.ts
│   │   ├── sessions.ts
│   │   ├── alerts.ts
│   │   ├── analytics.ts
│   │   ├── config.ts
│   │   └── realtime.ts
│   ├── services/           # API and service clients
│   │   ├── AuthService.ts
│   │   └── WebSocketClient.ts
│   ├── router/             # Vue Router configuration
│   │   └── index.ts
│   ├── types/              # TypeScript type definitions
│   │   └── index.ts
│   ├── App.vue            # Root component
│   └── main.ts            # Application entry point
├── tests/                  # Test files
│   └── unit/
│       ├── stores/
│       └── services/
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## Key Components

### 1. Views (Pages)

**Dashboard.vue**
- Overview metrics (sessions, revenue, active kiosks)
- Trend charts
- Recent alerts
- Device status summary

**KioskList.vue**
- List of all kiosks with status
- Filtering and search
- Actions: Restart, View Logs, Configure

**SessionsView.vue**
- Session management
- Filtering by date, type, status
- View session details
- Cancel in-progress sessions

**AlertsView.vue**
- Alert monitoring
- Acknowledge and resolve actions
- Filter by severity and status

**ConfigEditor.vue**
- Edit kiosk configuration
- Device settings (OBD, Thickness Meter)
- Payment settings
- Email/SMS settings

**LoginPage.vue**
- Authentication form
- JWT token-based login

### 2. State Management (Pinia Stores)

**kiosks**
- Manages kiosk list
- Actions: fetch, restart, update status

**sessions**
- Manages session data
- Filtering and cancellation

**alerts**
- Manages alerts
- Actions: fetch, acknowledge, resolve

**analytics**
- Dashboard overview data
- Metrics and trends

**config**
- Kiosk configuration
- Save and fetch config

**realtime**
- WebSocket connection management
- Event subscriptions

### 3. Services

**AuthService**
- Login/logout
- Token management
- Role-based access

**WebSocketClient**
- Socket.IO connection
- Event subscription
- Reconnection handling

### 4. Routing

Protected routes with authentication guards:
- Public: `/login`
- Protected: `/dashboard`, `/kiosks`, `/sessions`, `/alerts`
- Admin-only: `/config/:kioskId`

## Data Flow

### REST API Flow
1. User action triggers method in View
2. View calls Pinia store action
3. Store action makes HTTP request via Axios
4. Response updates store state
5. View reactively updates

### WebSocket Flow
1. `realtime` store initializes WebSocket connection
2. Backend emits events (e.g., `alert_triggered`)
3. WebSocket client receives event
4. Event handler updates appropriate store
5. UI updates reactively

## Authentication Flow

1. User submits login form
2. `AuthService.login()` posts credentials to `/api/auth/login`
3. Backend validates and returns JWT token
4. Token stored in localStorage
5. Axios interceptor adds token to all requests
6. Router guards check authentication before navigation

## Real-Time Updates

WebSocket events from backend:
- `session_started` - New session notification
- `payment_confirmed` - Payment confirmation
- `alert_triggered` - New alert
- `device_disconnected` - Device status change
- `kiosk_status_changed` - Kiosk online/offline

## Security

- JWT token authentication
- Role-based access control (operator/admin)
- Token expiration handling
- CORS configuration
- Secure WebSocket connection

## Performance Considerations

- Code splitting with dynamic imports
- Lazy loading of routes
- Minimal bundle size
- Efficient state management
- WebSocket connection pooling

## Deployment

The admin console is built as a static SPA and served by kiosk-agent:

```bash
cd apps/kiosk-admin
npm run build
# Output: dist/

# kiosk-agent serves from:
# app.use('/admin', express.static(path.join(__dirname, '../../kiosk-admin/dist')))
```

Access at: `http://localhost:8080/admin`

## Development Workflow

1. Start backend: `cd apps/kiosk-agent && npm run dev`
2. Start frontend: `cd apps/kiosk-admin && npm run dev`
3. Access at: `http://localhost:5173` (with proxy to backend)

## Testing Strategy

- Unit tests for stores and services (Vitest)
- Integration tests for API endpoints
- E2E tests for critical user flows (future)

## Future Enhancements

- Advanced analytics and reporting
- User management interface
- Firmware update management
- Multi-kiosk operations
- Export data capabilities
- Custom dashboard widgets
