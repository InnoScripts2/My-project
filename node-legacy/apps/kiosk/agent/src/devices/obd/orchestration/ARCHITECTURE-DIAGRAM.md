# OBD-II Orchestration Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (Kiosk UI)                          │
│                     (apps/kiosk-frontend)                            │
└───────────────┬──────────────────────────────────┬───────────────────┘
                │                                  │
                │ HTTP REST                        │ WebSocket
                │                                  │
┌───────────────▼──────────────────────────────────▼───────────────────┐
│                      Kiosk Agent (Express)                            │
│                    (apps/kiosk-agent/src)                             │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Middleware Layer                          │   │
│  │  • CORS (env-aware)                                          │   │
│  │  • Rate Limiter (10 req/min per IP)                          │   │
│  │  • Request Logger (morgan)                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│  ┌───────────────────────────┴───────────────────────────────┐     │
│  │                     API Layer                              │     │
│  │                                                            │     │
│  │  ┌──────────────────────┐    ┌──────────────────────┐    │     │
│  │  │   REST API Routes    │    │  WebSocket Handler   │    │     │
│  │  │  (obd.routes.ts)     │    │  (obd.websocket.ts)  │    │     │
│  │  │                      │    │                      │    │     │
│  │  │  POST /connect       │    │  ws://host/ws/obd    │    │     │
│  │  │  POST /scan          │    │                      │    │     │
│  │  │  GET  /status        │    │  Events:             │    │     │
│  │  │  GET  /results/:id   │    │  • status-update     │    │     │
│  │  │  POST /clear-dtc     │    │  • dtc-cleared       │    │     │
│  │  │  POST /disconnect    │    │  • error             │    │     │
│  │  └──────────┬───────────┘    └──────────┬───────────┘    │     │
│  │             │                           │                │     │
│  └─────────────┼───────────────────────────┼────────────────┘     │
│                │                           │                       │
│  ┌─────────────▼───────────────────────────▼────────────────┐     │
│  │              ObdOrchestrator                              │     │
│  │          (orchestration/ObdOrchestrator.ts)               │     │
│  │                                                           │     │
│  │  State Machine:                                           │     │
│  │  DISCONNECTED → CONNECTING → CONNECTED → SCANNING         │     │
│  │                                      ↓                     │     │
│  │  ERROR ←────────────────────── RESULTS_READY → IDLE       │     │
│  │                                                           │     │
│  │  Features:                                                │     │
│  │  • Session Management (UUID-based)                        │     │
│  │  • DTC Reading & PID Polling                              │     │
│  │  • Progress Tracking (0-100%)                             │     │
│  │  • Event Emission                                         │     │
│  │  • Timeout Handling (2 min default)                       │     │
│  │  • Structured JSON Logging                                │     │
│  └───────────────────────────┬───────────────────────────────┘     │
│                              │                                     │
│  ┌───────────────────────────▼───────────────────────────────┐   │
│  │              Session Management                            │   │
│  │          (orchestration/Session.ts)                        │   │
│  │                                                            │   │
│  │  • InMemorySessionStore (Map-based)                       │   │
│  │  • TTL: 1 hour (configurable)                             │   │
│  │  • Auto-cleanup every 5 minutes                           │   │
│  │  • Session Data:                                          │   │
│  │    - sessionId (UUID)                                     │   │
│  │    - dtcList (DtcEntry[])                                 │   │
│  │    - pidSnapshots (PidSnapshot[])                         │   │
│  │    - metadata (vehicle info)                              │   │
│  │    - timestamps & status                                  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                              │                                     │
│  ┌───────────────────────────▼───────────────────────────────┐   │
│  │              Device Driver Layer                           │   │
│  │          (driver/DeviceObd interface)                      │   │
│  │                                                            │   │
│  │  Methods:                                                  │   │
│  │  • init(config)                                            │   │
│  │  • readDtc() → DtcEntry[]                                 │   │
│  │  • readPid(pid) → PidValue                                │   │
│  │  • clearDtc() → boolean                                   │   │
│  │  • disconnect()                                            │   │
│  │  • getStatus() → ObdStatus                                │   │
│  │                                                            │   │
│  │  Events:                                                   │   │
│  │  • connected                                               │   │
│  │  • disconnected                                            │   │
│  │  • error                                                   │   │
│  └───────────────────────────┬───────────────────────────────┘   │
│                              │                                     │
│  ┌───────────────────────────▼───────────────────────────────┐   │
│  │         Implementation (DEV vs PROD)                       │   │
│  │                                                            │   │
│  │  DEV:  FakeObdDevice (mocks/FakeObdDevice.ts)             │   │
│  │        • Scenario-based simulation                         │   │
│  │        • DtcPresent, DtcCleared, AllNormal                │   │
│  │                                                            │   │
│  │  PROD: Elm327Driver                                        │   │
│  │        • Real ELM327 adapter communication                 │   │
│  │        • Serial/Bluetooth transport                        │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │           Monitoring & Observability                       │   │
│  │                                                            │   │
│  │  Prometheus Metrics (orchestration/metrics.ts):            │   │
│  │  • obd_sessions_total                                      │   │
│  │  • obd_scans_completed_total                               │   │
│  │  • obd_scans_failed_total {reason}                         │   │
│  │  • obd_dtc_cleared_total                                   │   │
│  │  • obd_scan_duration_seconds                               │   │
│  │                                                            │   │
│  │  Exposed at: GET /metrics                                  │   │
│  └───────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow: Typical Diagnostic Scan

```
Frontend           REST API         Orchestrator      Session Store      Driver
   │                 │                   │                  │              │
   │─── POST /connect ───────────────────▶                 │              │
   │                 │                   │                  │              │
   │                 │                   │─── init() ──────────────────────▶
   │                 │                   │                  │              │
   │                 │                   │◀── connected ───────────────────┤
   │                 │                   │                  │              │
   │                 │                   │─── CONNECTED     │              │
   │                 │                   │                  │              │
   │◀── 200 OK ──────┤                   │                  │              │
   │                 │                   │                  │              │
   │─── POST /scan ──────────────────────▶                 │              │
   │                 │                   │                  │              │
   │                 │                   │─── create session ───────────────▶
   │                 │                   │                  │              │
   │                 │                   │─── SCANNING      │              │
   │                 │                   │                  │              │
   │◀── 202 {sessionId} ─────────────────┤                 │              │
   │                 │                   │                  │              │
   │                 │                   │─── readDtc() ────────────────────▶
   │                 │                   │                  │              │
   │                 │                   │◀── DtcEntry[] ───────────────────┤
   │                 │                   │                  │              │
   │                 │                   │─── save dtcList ────────────────▶│
   │                 │                   │                  │              │
   │                 │                   │─── readPid('0C')─────────────────▶
   │                 │                   │◀── PidValue ─────────────────────┤
   │                 │                   │                  │              │
   │                 │                   │─── readPid('0D')─────────────────▶
   │                 │                   │◀── PidValue ─────────────────────┤
   │                 │                   │                  │              │
   │                 │                   │─── ... (poll for 10s) ───────────▶
   │                 │                   │                  │              │
   │                 │                   │─── save pidSnapshots ────────────▶│
   │                 │                   │                  │              │
   │                 │                   │─── RESULTS_READY │              │
   │                 │                   │                  │              │
   │─── GET /status ─────────────────────▶                 │              │
   │                 │                   │                  │              │
   │◀── 200 {progress:100, status:RESULTS_READY} ──────────┤              │
   │                 │                   │                  │              │
   │─── GET /results/:sessionId ─────────▶                 │              │
   │                 │                   │                  │              │
   │                 │                   │─── get(sessionId) ───────────────▶
   │                 │                   │◀── DiagnosticSession ────────────┤
   │                 │                   │                  │              │
   │◀── 200 {session} ───────────────────┤                 │              │
   │                 │                   │                  │              │
```

## WebSocket Event Flow

```
Frontend           WebSocket         Orchestrator
   │                  │                   │
   │─── connect ws://host/ws/obd ────────▶
   │                  │                   │
   │◀── connected ────┤                   │
   │                  │                   │
   │                  │                   │── event: scan-progress ──▶
   │                  │                   │                           │
   │                  │◀── broadcast ─────┤                           │
   │                  │   {type: 'status-update',                     │
   │◀─────────────────┤    progress: 50}                              │
   │                  │                   │                           │
   │                  │                   │── event: scan-complete ───▶
   │                  │                   │                           │
   │                  │◀── broadcast ─────┤                           │
   │◀─────────────────┤   {type: 'status-update',                     │
   │                  │    progress: 100}                             │
   │                  │                   │                           │
   │                  │◀── ping ──────────┤  (every 30s)              │
   │                  │                   │                           │
   │                  │─── pong ──────────▶                           │
   │                  │                   │                           │
```

## State Machine Transitions

```
     ┌──────────────┐
     │ DISCONNECTED │
     └──────┬───────┘
            │ connect()
            │
     ┌──────▼───────┐
     │  CONNECTING  │
     └──────┬───────┘
            │ driver.emit('connected')
            │
     ┌──────▼───────┐
     │  CONNECTED   │◀────────────┐
     └──────┬───────┘             │
            │ startScan()         │
            │                     │
     ┌──────▼───────┐             │
     │   SCANNING   │             │
     └──────┬───────┘             │
            │ scan complete       │
            │                     │
     ┌──────▼───────────┐         │
     │ RESULTS_READY    │         │
     └──────┬───────────┘         │
            │ clearDtc()          │
            │                     │
     ┌──────▼───────┐             │
     │     IDLE     │─────────────┘
     └──────┬───────┘   (ready for next scan)
            │
            │ disconnect()
            │
     ┌──────▼───────┐
     │ DISCONNECTED │
     └──────────────┘
     
     Any state ──[error]──▶ ERROR
```

## Configuration Flow

```
┌──────────────────────────────────────────────────────────┐
│              Environment Variables                        │
│                                                          │
│  AGENT_ENV: DEV | QA | PROD                              │
│  KIOSK_DOMAIN: http://kiosk.example.com (PROD)          │
│  OBD_PORT: /dev/ttyUSB0 (optional)                       │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│          config/obd-orchestrator.json                     │
│                                                          │
│  {                                                       │
│    "scanTimeout": 120000,        // 2 minutes           │
│    "pidPollInterval": 500,       // 500ms               │
│    "pidPollDuration": 10000,     // 10 seconds          │
│    "sessionTTL": 3600000,        // 1 hour              │
│    "supportedPids": ["0C", "0D", "05", "0F", "11"],     │
│    "maxConcurrentSessions": 1                           │
│  }                                                       │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│              ObdOrchestrator Config                       │
│                                                          │
│  • Read on instantiation                                 │
│  • Falls back to defaults if file missing                │
│  • Validates configuration on startup                    │
└──────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
┌──────────────────┐
│  API Endpoint    │
└────────┬─────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│              Try-Catch Block                            │
│                                                        │
│  try {                                                 │
│    const result = await orchestrator.method();        │
│    res.json({ ...result });                           │
│  } catch (error) {                                    │
│    if (error instanceof ObdSessionError) {            │
│      res.status(503).json({                           │
│        error: error.code,                             │
│        message: error.message,                        │
│        details: error.details                         │
│      });                                              │
│    } else if (error instanceof ObdStateError) {       │
│      res.status(400).json({                           │
│        error: error.code,                             │
│        message: error.message,                        │
│        currentState: error.currentState               │
│      });                                              │
│    } else {                                           │
│      res.status(500).json({                           │
│        error: 'internal_error',                       │
│        message: error.message                         │
│      });                                              │
│    }                                                  │
│  }                                                    │
└────────────────────────────────────────────────────────┘
```

## Rate Limiting Flow

```
┌────────────────┐
│  HTTP Request  │
└────────┬───────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│              Rate Limiter Middleware                    │
│                                                        │
│  1. Extract IP address                                 │
│  2. Check DEV mode bypass (localhost)                  │
│  3. Lookup rate limit entry                            │
│  4. If first request or expired:                       │
│     • Create new entry (count=1)                       │
│     • Set reset time (now + 60s)                       │
│     • Allow request                                    │
│  5. If under limit (count < 10):                       │
│     • Increment count                                  │
│     • Allow request                                    │
│  6. If over limit (count >= 10):                       │
│     • Calculate retry-after                            │
│     • Return 429 with Retry-After header              │
└────────────────────────────────────────────────────────┘
```

## Key Files Reference

```
apps/kiosk-agent/
├── config/
│   └── obd-orchestrator.json          # Configuration
├── src/
│   ├── api/
│   │   ├── middleware/
│   │   │   └── rateLimiter.ts         # Rate limiting (10 req/min)
│   │   ├── routes/
│   │   │   └── obd.routes.ts          # REST API endpoints
│   │   └── websocket/
│   │       └── obd.websocket.ts       # WebSocket handler
│   ├── devices/obd/
│   │   ├── orchestration/
│   │   │   ├── ObdOrchestrator.ts     # Core orchestration
│   │   │   ├── Session.ts             # Session management
│   │   │   ├── errors.ts              # Custom errors
│   │   │   ├── metrics.ts             # Prometheus metrics
│   │   │   └── __tests__/             # Tests
│   │   ├── driver/
│   │   │   └── DeviceObd.ts           # Driver interface
│   │   └── mocks/
│   │       └── FakeObdDevice.ts       # DEV mock
│   └── index.ts                        # Main app entry
└── tsconfig.json                       # TypeScript config
```
