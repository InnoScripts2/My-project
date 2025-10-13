# Quick Start Guide — Supabase, Bluetooth, and Offline Integration

This guide provides a quick overview of the new features and how to use them.

## 🚀 What's New

### 1. Supabase Payments Webhook

A new Edge Function that securely receives payment provider webhooks with HMAC validation.

**Setup:**
```bash
# Deploy the function
supabase functions deploy payments-webhook --no-verify-jwt

# Set environment variables in Supabase Dashboard
# Functions → payments-webhook → Settings → Secrets
PROVIDER_WEBHOOK_SECRET=your-secret-here
```

**Webhook URL:**
```
https://<your-project-id>.supabase.co/functions/v1/payments-webhook
```

**Testing:**
```bash
curl -X POST https://<project>.supabase.co/functions/v1/payments-webhook \
  -H "Content-Type: application/json" \
  -H "x-provider-signature: <hmac-sha256-signature>" \
  -d '{"event_type":"payment.test","payment_id":"test_123","status":"succeeded"}'
```

### 2. Android Bluetooth Permissions

The Android app now properly requests Bluetooth and Location permissions.

**What changed:**
- Added `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `ACCESS_FINE_LOCATION` permissions
- Runtime permission request with user-friendly explanation dialog
- Graceful handling of permission denial

**User Experience:**
1. On first launch, user sees explanation dialog
2. System permission dialog appears
3. If denied, app continues with limited functionality
4. User can enable later in Settings

### 3. Vehicle Profiles for OBD-II

Adaptive protocol selection based on vehicle make and year.

**Example:**
```typescript
import { getVehicleProfile, getProtocolSequence } from './vehicleProfiles.js';

// Get profile for 2015 Toyota
const profile = getVehicleProfile('Toyota', 2015);
console.log(profile.primaryProtocol.protocol); // 'CAN_11B_500'
console.log(profile.primaryProtocol.elmCommand); // 'ATSP6'

// Get all protocols to try (with fallbacks)
const sequence = getProtocolSequence('Toyota', 2015);
// Returns: [CAN_11B_500, CAN_29B_500, ISO_9141_2]

// Legacy vehicle
const legacyProfile = getVehicleProfile('Toyota', 2005);
console.log(legacyProfile.primaryProtocol.protocol); // 'ISO_9141_2'
console.log(legacyProfile.quirks?.slowInit); // true
```

**Supported manufacturers:**
- Toyota, Lexus (with year-specific profiles)
- Ford, GM, Chrysler, Honda, Nissan
- BMW, Mercedes-Benz, VW, Audi
- Generic fallback for unknown makes

### 4. Enhanced Service Worker

Improved offline caching with network-first strategy.

**Features:**
- Network-first, cache fallback
- API requests always go to network (not cached)
- Stale cache detection (7 days max age)
- Runtime commands: `SKIP_WAITING`, `CACHE_ICONS`, `CLEAR_CACHE`, `GET_VERSION`

**Example:**
```javascript
// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}

// Send command to service worker
navigator.serviceWorker.ready.then((registration) => {
  registration.active.postMessage({
    type: 'CACHE_ICONS'
  });
});

// Get version
navigator.serviceWorker.ready.then((registration) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = (event) => {
    console.log('SW version:', event.data.version);
  };
  registration.active.postMessage(
    { type: 'GET_VERSION' },
    [channel.port2]
  );
});
```

## 📚 Documentation

### Full Guides

- **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** — Complete Supabase setup (14KB)
  - Creating project
  - API keys
  - Migrations
  - Edge Functions
  - Webhook integration
  - Troubleshooting

- **[BLUETOOTH_OBD_INTEGRATION.md](./BLUETOOTH_OBD_INTEGRATION.md)** — Bluetooth/OBD-II integration (17KB)
  - Architecture overview
  - Supported adapters
  - OBD-II protocols
  - Toyota/Lexus specifics
  - Android permissions
  - Troubleshooting

### Quick Reference

#### Environment Variables

Add to `.env`:
```env
# Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Payment webhook
PROVIDER_WEBHOOK_SECRET=your-webhook-secret

# OBD-II (optional, has defaults)
OBD_CONNECT_MAX_ATTEMPTS=5
OBD_CONNECT_BASE_DELAY_MS=1000
OBD_INIT_MAX_ATTEMPTS=3
```

#### API Endpoints

**OBD Connection:**
```http
POST /api/obd/connect
Content-Type: application/json

{
  "transport": "bluetooth",
  "deviceAddress": "00:1D:A5:12:34:56",
  "vehicleMake": "Toyota",
  "vehicleYear": 2015
}
```

**Read DTC:**
```http
POST /api/obd/read-dtc
```

**Clear DTC:**
```http
POST /api/obd/clear-dtc
Content-Type: application/json

{
  "confirm": true
}
```

## 🧪 Testing

### Run All Tests

```bash
npm run test:all
```

### Test Vehicle Profiles

```bash
cd apps/kiosk-agent
npm test -- src/devices/obd/vehicleProfiles.test.ts
```

### Test OBD Self-Check (Requires Hardware)

```bash
cd apps/kiosk-agent
npm run self-check:obd -- --port COM3
```

### Test Webhook (Mock)

```bash
curl -X POST http://localhost:7070/api/test/webhook \
  -H "Content-Type: application/json" \
  -d '{"event_type":"payment.test","amount":100}'
```

## 🔧 Development Workflow

### 1. Local Development

```bash
# Start agent + frontend
npm run dev

# Or separately:
npm run agent      # Agent on :7070
npm run static     # Frontend on :8080
```

### 2. Deploy Supabase Changes

```bash
# Link to project
supabase link --project-ref <your-project-ref>

# Apply migrations
supabase db push

# Deploy functions
supabase functions deploy payments-webhook --no-verify-jwt
supabase functions deploy ai-chat --no-verify-jwt
```

### 3. Build Android APK

```bash
# Check prerequisites
npm run apk:doctor

# Build debug APK
npm run apk:build

# Build release APK (requires signing)
npm run apk:build:release
```

## 🐛 Common Issues

### Webhook Returns 401

**Problem:** HMAC signature verification failed.

**Solution:**
1. Check `PROVIDER_WEBHOOK_SECRET` is set correctly in Supabase
2. Ensure signature is HMAC-SHA256 hex-encoded
3. Verify signature is generated from raw request body

### Bluetooth Permissions Denied

**Problem:** User denied Bluetooth permissions.

**Solution:**
1. User sees informative dialog explaining limited functionality
2. User can enable later: Settings → Apps → Kiosk → Permissions
3. App works without Bluetooth (diagnostics disabled)

### OBD Adapter Not Detected

**Problem:** Can't connect to OBD-II adapter.

**Solution:**
1. Check Bluetooth is enabled
2. Verify adapter is paired (Settings → Bluetooth)
3. Try unplugging/replugging adapter from OBD-II port
4. Check adapter is compatible (ELM327 v1.5+)

### Service Worker Not Updating

**Problem:** Old service worker still active.

**Solution:**
```javascript
// Force update
navigator.serviceWorker.ready.then((registration) => {
  registration.update();
  registration.active.postMessage({ type: 'SKIP_WAITING' });
});

// Or clear cache
navigator.serviceWorker.ready.then((registration) => {
  const channel = new MessageChannel();
  registration.active.postMessage(
    { type: 'CLEAR_CACHE' },
    [channel.port2]
  );
});
```

## 📊 Metrics and Monitoring

### Check Supabase Health

```bash
curl http://localhost:7070/api/readiness
```

Response:
```json
{
  "ok": true,
  "checks": {
    "supabase": {
      "status": "ok",
      "latency": 123,
      "serviceKeyConfigured": true
    },
    "edgeFunction": {
      "status": "ok",
      "latency": 456
    }
  }
}
```

### Check OBD Connection

```bash
curl http://localhost:7070/api/obd/status
```

Response:
```json
{
  "state": "connected",
  "transport": "bluetooth",
  "identity": "ELM327 v2.1",
  "protocol": "ISO 15765-4",
  "metrics": {
    "totalCommands": 45,
    "successfulCommands": 43,
    "failedCommands": 2
  }
}
```

### View Webhook Events

```sql
-- In Supabase SQL Editor
SELECT id, event_type, created_at
FROM webhook_events
ORDER BY created_at DESC
LIMIT 10;
```

## 🎯 Next Steps

1. **Production Deployment:**
   - Set up production Supabase project
   - Configure real payment provider webhook
   - Enable HTTPS for Android APK
   - Set up monitoring/alerts

2. **Hardware Integration:**
   - Test with real OBD-II adapters
   - Calibrate timeouts for specific adapters
   - Test with Toyota/Lexus vehicles
   - Document adapter compatibility

3. **Feature Enhancements:**
   - Add more vehicle profiles
   - Support additional protocols (DoIP)
   - Implement PID live data streaming
   - Add freeze frame data extraction

## 📞 Support

For detailed documentation, see:
- [docs/tech/SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
- [docs/tech/BLUETOOTH_OBD_INTEGRATION.md](./BLUETOOTH_OBD_INTEGRATION.md)
- [docs/tech/AGENT_API_BASE_CONFIG.md](./AGENT_API_BASE_CONFIG.md)

For issues, check troubleshooting sections in respective docs.

---

**Version:** 1.0  
**Updated:** 2025-01-06  
**Author:** GitHub Copilot Agent
