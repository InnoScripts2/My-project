# Kiosk Admin Console

Web-based admin panel for operators and administrators of kiosk fleet management. Built with Vue 3, Ant Design Vue, and Socket.IO for real-time monitoring and management.

## Features

- **Dashboard Monitoring** - Real-time metrics, revenue tracking, and active session monitoring
- **Kiosk Management** - View status, restart kiosks, view logs, and configure settings
- **Session Management** - Track all sessions, filter by type/status, view details, cancel active sessions
- **Alert Management** - Monitor alerts, acknowledge and resolve issues
- **Configuration Editor** - Edit device, payment, and email settings for each kiosk
- **Real-time Updates** - WebSocket-based live updates for kiosk status, alerts, and sessions
- **Role-based Access** - Operator (read-only) and Admin (full access) roles
- **Responsive Design** - Works on desktop and tablet devices

## Tech Stack

- **Vue 3** - Composition API for reactive UI
- **Ant Design Vue 4** - Enterprise UI components
- **Pinia** - State management
- **Vue Router** - Client-side routing
- **Socket.IO Client** - Real-time bidirectional communication
- **Axios** - HTTP client with interceptors
- **TypeScript** - Type safety
- **Vite** - Fast build tool

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Running kiosk-agent backend on port 8080

### Installation

```bash
cd apps/kiosk-admin
npm install
```

### Development

Start the dev server with hot reload:

```bash
npm run dev
```

Access at: `http://localhost:5173`

The dev server automatically proxies API requests to `http://localhost:8080`.

### Build

Compile for production:

```bash
npm run build
```

Output is in `dist/` directory.

### Testing

Run unit tests:

```bash
npm test
```

Run tests with UI:

```bash
npm run test:ui
```

## Project Structure

```
src/
├── views/              # Page components
│   ├── Dashboard.vue
│   ├── KioskList.vue
│   ├── SessionsView.vue
│   ├── AlertsView.vue
│   ├── ConfigEditor.vue
│   └── LoginPage.vue
├── layouts/            # Layout components
│   └── MainLayout.vue
├── stores/             # Pinia stores
│   ├── kiosks.ts
│   ├── sessions.ts
│   ├── alerts.ts
│   ├── analytics.ts
│   ├── config.ts
│   └── realtime.ts
├── services/           # API clients
│   ├── AuthService.ts
│   └── WebSocketClient.ts
├── router/             # Vue Router config
│   └── index.ts
├── types/              # TypeScript types
│   └── index.ts
└── main.ts            # Entry point
```

## Authentication

The admin console uses JWT token authentication:

1. Login with username/password at `/login`
2. Token is stored in localStorage
3. Token is automatically added to all API requests
4. Token expiration is handled by router guards

**Test Credentials:**

Admin (full access):
- Username: `admin`
- Password: `admin`

Operator (read-only):
- Username: `operator`
- Password: `operator`

## Role-Based Access

### Operator Role
- View dashboards and metrics
- View kiosk list and status
- View sessions and details
- View and acknowledge alerts
- Restart kiosks

### Admin Role
- All operator permissions
- Edit kiosk configuration
- Manage users (future)
- Update firmware (future)

## API Endpoints

The admin console consumes the following REST API endpoints:

- `GET /api/kiosks` - List all kiosks
- `POST /api/kiosks/:id/restart` - Restart kiosk
- `GET /api/kiosks/:id/logs` - Get kiosk logs
- `GET /api/kiosks/:id/config` - Get configuration
- `PUT /api/kiosks/:id/config` - Update configuration
- `GET /api/sessions` - List sessions
- `POST /api/sessions/:id/cancel` - Cancel session
- `GET /api/monitoring/alerts` - List alerts
- `POST /api/monitoring/alerts/:id/acknowledge` - Acknowledge alert
- `POST /api/monitoring/alerts/:id/resolve` - Resolve alert
- `GET /api/analytics/dashboard` - Get dashboard metrics
- `POST /api/auth/login` - Authenticate user

See [API Documentation](./docs/API.md) for detailed API reference.

## WebSocket Events

Real-time events from backend:

- `session_started` - New session started
- `payment_confirmed` - Payment confirmed
- `alert_triggered` - New alert triggered
- `device_disconnected` - Device disconnected
- `kiosk_status_changed` - Kiosk status changed

## Deployment

The admin console is served as static files by kiosk-agent:

```bash
# Build the admin console
cd apps/kiosk-admin
npm run build

# kiosk-agent will serve from dist/ at /admin path
# Access at: http://localhost:8080/admin
```

## Configuration

Environment variables (`.env` file):

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080
```

## Troubleshooting

### WebSocket Connection Failed
Check that kiosk-agent WebSocket server is running on port 8080.

### API 401 Unauthorized
Token may have expired. Re-login to get a new token.

### Charts Not Loading
Verify that `/api/analytics/dashboard` endpoint is accessible.

### CORS Errors
Ensure kiosk-agent has CORS enabled for the admin console origin.

## Development Workflow

1. Start kiosk-agent backend:
   ```bash
   cd apps/kiosk-agent
   npm run dev
   ```

2. Start admin console frontend:
   ```bash
   cd apps/kiosk-admin
   npm run dev
   ```

3. Open browser at `http://localhost:5173`

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - System architecture and design
- [API Reference](./docs/API.md) - Complete API documentation

## Contributing

1. Follow the existing code style
2. Write unit tests for new features
3. Update documentation
4. Test on different screen sizes
5. Ensure TypeScript types are correct

## License

Internal use only. Not for public distribution.
