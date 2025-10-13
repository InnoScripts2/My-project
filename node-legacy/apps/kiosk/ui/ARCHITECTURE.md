# Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                      index.html                            │ │
│  │  <script type="module" src="/src/main.js"></script>       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                      main.js                               │ │
│  │  - loadConfig()                                            │ │
│  │  - initNavigation()                                        │ │
│  │  - initDeviceStatus()                                      │ │
│  │  - initPaymentClient()                                     │ │
│  │  - initSessionManager()                                    │ │
│  │  - initErrorHandler()                                      │ │
│  │  - initDevMode()                                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│        ┌─────────────────────┼─────────────────────┐            │
│        ▼                     ▼                     ▼            │
│  ┌─────────┐          ┌─────────┐          ┌─────────┐         │
│  │  Core   │          │ Screens │          │  Utils  │         │
│  │ Modules │          │ Modules │          │         │         │
│  └─────────┘          └─────────┘          └─────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
   ┌───────────────┐    ┌───────────────┐   ┌──────────────┐
   │  REST API     │    │  WebSocket    │   │  Service     │
   │  (HTTP)       │    │  (WS)         │   │  Worker      │
   │               │    │               │   │              │
   │  /api/*       │    │  /ws/obd      │   │  Caching     │
   └───────────────┘    └───────────────┘   └──────────────┘
           │                    │                    │
           └────────────────────┴────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Kiosk Agent       │
                    │   (Node.js)         │
                    │                     │
                    │  - OBD Adapter      │
                    │  - Thickness Meter  │
                    │  - Payment Provider │
                    │  - Report Generator │
                    └─────────────────────┘
```

## Module Dependencies

```
main.js
├── core/config.js
├── core/api-client.js
│   └── core/config.js
├── core/navigation.js
├── core/device-status.js
│   └── core/config.js
├── core/payment-client.js
│   └── core/api-client.js
├── core/session-manager.js
│   ├── core/config.js
│   └── core/navigation.js
├── core/error-handler.js
└── core/dev-mode.js
    └── core/config.js

screens/ (future)
├── attract.js
│   ├── core/navigation.js
│   └── core/session-manager.js
├── welcome.js
│   ├── core/navigation.js
│   └── core/session-manager.js
├── services.js
│   ├── core/navigation.js
│   └── core/session-manager.js
└── diagnostics-*.js
    ├── core/api-client.js
    ├── core/device-status.js
    ├── core/payment-client.js
    └── core/session-manager.js

utils/
├── debounce.js
├── formatters.js
└── validators.js
```

## Data Flow

### Screen Navigation Flow

```
[User Interaction]
        │
        ▼
  [navigation.js]
  showScreen(id)
        │
        ├─ Hide current screen
        ├─ Show target screen
        ├─ Update sessionStorage
        └─ Trigger listeners
              │
              ▼
    [Screen Module]
    onScreenActivated()
        │
        ├─ Initialize UI
        ├─ Load data
        └─ Setup event handlers
```

### API Call Flow

```
[Screen Module]
  request data
        │
        ▼
  [api-client.js]
        │
        ├─ Retry logic (3 attempts)
        ├─ Exponential backoff
        └─ Error handling
              │
              ▼
         [Fetch API]
              │
              ▼
      [Kiosk Agent API]
              │
              ▼
         [Response]
              │
              ├─ Success → return data
              └─ Error → [error-handler.js]
                            │
                            └─ Show modal
```

### WebSocket Status Flow

```
[device-status.js]
    connect()
        │
        ▼
   [WebSocket]
   ws://host/ws/obd
        │
        ├─ onopen → isConnected = true
        ├─ onmessage → handleMessage()
        │                    │
        │                    ├─ Parse JSON
        │                    ├─ Update UI elements
        │                    └─ Notify subscribers
        │
        ├─ onclose → scheduleReconnect()
        └─ onerror → log error

[Subscribers]
    │
    ├─ Progress bars
    ├─ Status badges
    └─ Screen modules
```

### Payment Flow

```
[Screen Module]
  request payment
        │
        ▼
[payment-client.js]
  createIntent()
        │
        ├─ POST /payments/intent
        ├─ Get intentId & QR
        └─ Display QR
              │
              ▼
     startPolling(intentId)
        │
        ├─ Every 2 seconds
        ├─ GET /payments/:id/status
        └─ Check status
              │
              ├─ pending → continue polling
              ├─ succeeded → stop & callback
              └─ failed → stop & error
```

### Session Management Flow

```
[User Interaction]
        │
        ▼
[session-manager.js]
  resetIdleTimer()
        │
        ├─ Clear previous timer
        └─ Set new timer (120s)
              │
              └─ On timeout
                    │
                    ├─ clearSessionState()
                    └─ showScreen('screen-attract')

[Session State]
    │
    ├─ contact.thickness
    ├─ contact.diagnostics
    ├─ session.thicknessId
    ├─ session.obdId
    ├─ reportSent.thickness
    ├─ reportSent.diagnostics
    ├─ selectedService
    └─ obdMode
```

## Service Worker Caching Flow

```
[Browser Request]
        │
        ▼
  [Service Worker]
        │
        ├─ Static Asset? ──→ Cache-First
        │                         │
        │                         ├─ Check cache
        │                         ├─ If hit → return
        │                         └─ If miss → network → cache
        │
        ├─ API Request? ──→ Network-First
        │                         │
        │                         ├─ Try network
        │                         ├─ If success → cache → return
        │                         └─ If fail → check cache → return
        │
        └─ HTML? ──→ Stale-While-Revalidate
                          │
                          ├─ Return cached immediately
                          └─ Update cache in background
```

## Dev Mode Flow

```
[User Gesture]
    │
    ├─ Ctrl+Shift+D
    └─ 3 Fingers × 5s
        │
        ▼
  [dev-mode.js]
    toggleDevMode()
        │
        ├─ Set localStorage.devMode = true
        ├─ Show indicator
        └─ Update UI
              │
              ├─ Show [data-dev-only] elements
              ├─ Show dev notification
              └─ Enable tree-shakable dev code
```

## Build Process

```
[Source Files]
    │
    ├─ src/main.js
    ├─ src/core/*.js
    ├─ src/screens/*.js
    ├─ src/utils/*.js
    └─ styles.css
        │
        ▼
    [Vite Build]
        │
        ├─ Module resolution
        ├─ Tree-shaking
        ├─ Code splitting
        ├─ Minification
        └─ Asset optimization
              │
              ▼
        [dist/]
            │
            ├─ index.html (inlined CSS)
            ├─ assets/main-[hash].js
            └─ assets/main-[hash].css
```

## Testing Architecture

```
[Playwright Tests]
    │
    ├─ navigation.spec.js
    │   └─ Screen transitions
    │
    ├─ accessibility.spec.js
    │   ├─ Axe-core scanning
    │   ├─ Keyboard navigation
    │   └─ Touch targets
    │
    ├─ dev-flag.spec.js
    │   └─ Dev mode activation
    │
    └─ (future)
        ├─ paywall.spec.js
        ├─ device-status.spec.js
        └─ performance.spec.js
```

## Error Handling Flow

```
[Error Source]
    │
    ├─ API Error
    ├─ WebSocket Error
    ├─ Unhandled Promise Rejection
    └─ Global Error
        │
        ▼
  [error-handler.js]
        │
        ├─ Log to console
        ├─ Show modal (if appropriate)
        └─ Offer retry option
              │
              └─ User clicks retry
                    │
                    └─ Execute retry callback
```

## Security Boundaries

```
┌─────────────────────────────────────┐
│         Browser (Untrusted)          │
│                                     │
│  ┌───────────────────────────────┐  │
│  │   Frontend Code               │  │
│  │   - No secrets                │  │
│  │   - No business logic         │  │
│  │   - Presentation only         │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
              │
              │ HTTPS + CORS
              │
┌─────────────────────────────────────┐
│      Kiosk Agent (Trusted)          │
│                                     │
│  ┌───────────────────────────────┐  │
│  │   Business Logic              │  │
│  │   - Authentication            │  │
│  │   - Authorization             │  │
│  │   - Data validation           │  │
│  │   - Secrets management        │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```
