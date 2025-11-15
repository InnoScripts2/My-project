# Admin Console API Documentation

## Overview

This document describes the REST API endpoints and WebSocket events used by the Admin Console to interact with the kiosk-agent backend.

## Base URL

- Development: `http://localhost:8080`
- Production: `https://your-domain.com`

## Authentication

All API endpoints (except `/api/auth/login`) require JWT authentication.

**Header:**
```
Authorization: Bearer <token>
```

Token is automatically added by Axios interceptor after successful login.

## REST API Endpoints

### Authentication

#### POST `/api/auth/login`

Authenticate user and receive JWT token.

**Request:**
```json
{
  "username": "admin",
  "password": "password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "1",
    "username": "admin",
    "role": "admin"
  },
  "expiresAt": 1737801600
}
```

**Status Codes:**
- `200` - Success
- `401` - Invalid credentials

### Kiosks Management

#### GET `/api/kiosks`

Get list of all kiosks.

**Response:**
```json
[
  {
    "kioskId": "kiosk-001",
    "location": "Moscow Center",
    "status": "online",
    "uptime": 86400,
    "lastSeen": "2025-01-15T12:00:00Z"
  }
]
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized

#### POST `/api/kiosks/:id/restart`

Restart a specific kiosk.

**Response:**
```json
{
  "success": true,
  "message": "Kiosk restart initiated"
}
```

**Status Codes:**
- `200` - Success
- `404` - Kiosk not found
- `401` - Unauthorized

#### GET `/api/kiosks/:id/logs`

Get logs for a specific kiosk.

**Query Parameters:**
- `limit` (optional) - Number of log entries to return
- `offset` (optional) - Offset for pagination

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2025-01-15T12:00:00Z",
      "level": "info",
      "message": "Session started"
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `404` - Kiosk not found
- `401` - Unauthorized

#### GET `/api/kiosks/:id/config`

Get configuration for a specific kiosk.

**Response:**
```json
{
  "obdPort": "COM3",
  "obdBaudRate": 38400,
  "thicknessDeviceId": "AA:BB:CC:DD:EE:FF",
  "yookassaShopId": "12345",
  "smtpHost": "smtp.example.com",
  "smtpPort": 587
}
```

**Status Codes:**
- `200` - Success
- `404` - Kiosk not found
- `401` - Unauthorized

#### PUT `/api/kiosks/:id/config`

Update configuration for a specific kiosk.

**Request:**
```json
{
  "obdPort": "COM3",
  "obdBaudRate": 38400,
  "thicknessDeviceId": "AA:BB:CC:DD:EE:FF",
  "yookassaShopId": "12345",
  "smtpHost": "smtp.example.com",
  "smtpPort": 587
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration updated"
}
```

**Status Codes:**
- `200` - Success
- `404` - Kiosk not found
- `401` - Unauthorized
- `403` - Forbidden (requires admin role)

### Sessions Management

#### GET `/api/sessions`

Get list of sessions.

**Query Parameters:**
- `startDate` (optional) - Filter by start date
- `endDate` (optional) - Filter by end date
- `type` (optional) - Filter by type: `THICKNESS` | `DIAGNOSTICS`
- `status` (optional) - Filter by status: `in-progress` | `completed` | `incomplete` | `failed`

**Response:**
```json
[
  {
    "sessionId": "session-001",
    "type": "DIAGNOSTICS",
    "status": "completed",
    "startedAt": "2025-01-15T10:00:00Z",
    "duration": 180,
    "client": "client@example.com"
  }
]
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized

#### POST `/api/sessions/:id/cancel`

Cancel an in-progress session.

**Response:**
```json
{
  "success": true,
  "message": "Session canceled"
}
```

**Status Codes:**
- `200` - Success
- `404` - Session not found
- `401` - Unauthorized

### Alerts Management

#### GET `/api/monitoring/alerts`

Get list of alerts.

**Response:**
```json
[
  {
    "alertId": "alert-001",
    "timestamp": "2025-01-15T11:30:00Z",
    "severity": "warning",
    "name": "Device Connection Issue",
    "description": "OBD adapter connection unstable",
    "status": "active"
  }
]
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized

#### POST `/api/monitoring/alerts/:id/acknowledge`

Acknowledge an alert.

**Response:**
```json
{
  "success": true,
  "message": "Alert acknowledged"
}
```

**Status Codes:**
- `200` - Success
- `404` - Alert not found
- `401` - Unauthorized

#### POST `/api/monitoring/alerts/:id/resolve`

Resolve an alert.

**Response:**
```json
{
  "success": true,
  "message": "Alert resolved"
}
```

**Status Codes:**
- `200` - Success
- `404` - Alert not found
- `401` - Unauthorized

### Analytics

#### GET `/api/analytics/dashboard`

Get dashboard overview metrics.

**Response:**
```json
{
  "totalSessions": 156,
  "totalRevenue": 74880,
  "activeKiosks": 2,
  "activeSessions": 1,
  "trendsChart": {},
  "topErrors": [],
  "recentAlerts": []
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized

## WebSocket Events

### Connection

Connect to WebSocket server:
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8080', {
  transports: ['websocket']
});
```

### Server-to-Client Events

#### `session_started`

Emitted when a new session is started.

**Payload:**
```json
{
  "sessionId": "session-123",
  "type": "DIAGNOSTICS",
  "kioskId": "kiosk-001",
  "startedAt": "2025-01-15T12:00:00Z"
}
```

#### `payment_confirmed`

Emitted when a payment is confirmed.

**Payload:**
```json
{
  "paymentId": "payment-456",
  "sessionId": "session-123",
  "amount": 480,
  "timestamp": "2025-01-15T12:05:00Z"
}
```

#### `alert_triggered`

Emitted when a new alert is triggered.

**Payload:**
```json
{
  "alertId": "alert-789",
  "severity": "warning",
  "name": "Device Connection Issue",
  "description": "OBD adapter connection unstable",
  "status": "active",
  "timestamp": "2025-01-15T12:10:00Z"
}
```

#### `device_disconnected`

Emitted when a device is disconnected.

**Payload:**
```json
{
  "device": "obd_adapter",
  "kioskId": "kiosk-001",
  "timestamp": "2025-01-15T12:15:00Z"
}
```

#### `kiosk_status_changed`

Emitted when a kiosk status changes.

**Payload:**
```json
{
  "kioskId": "kiosk-001",
  "status": "offline",
  "timestamp": "2025-01-15T12:20:00Z"
}
```

### Client-to-Server Events

#### `ping`

Heartbeat to check connection.

**Response:** `pong`

## Error Handling

All API errors follow this format:

```json
{
  "error": "error_code",
  "message": "Human-readable error message"
}
```

Common error codes:
- `unauthorized` - Missing or invalid token
- `forbidden` - Insufficient permissions
- `not_found` - Resource not found
- `validation_error` - Invalid request data
- `internal_error` - Server error

## Rate Limiting

No rate limiting is currently implemented, but may be added in future versions.

## CORS

CORS is enabled for all origins in development. In production, configure allowed origins in environment variables.

## Testing

Use these credentials for testing:

**Admin:**
- Username: `admin`
- Password: `admin`

**Operator:**
- Username: `operator`
- Password: `operator`

## Example Usage

### Login and Fetch Kiosks

```javascript
import axios from 'axios';

// Login
const loginResponse = await axios.post('http://localhost:8080/api/auth/login', {
  username: 'admin',
  password: 'admin'
});

const token = loginResponse.data.token;

// Fetch kiosks
const kiosksResponse = await axios.get('http://localhost:8080/api/kiosks', {
  headers: {
    Authorization: `Bearer ${token}`
  }
});

console.log(kiosksResponse.data);
```

### WebSocket Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8080');

socket.on('connect', () => {
  console.log('Connected to WebSocket');
});

socket.on('alert_triggered', (data) => {
  console.log('New alert:', data);
});

socket.on('kiosk_status_changed', (data) => {
  console.log('Kiosk status changed:', data);
});
```
