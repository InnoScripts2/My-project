# OBD-II Driver Architecture

## Overview

The OBD-II driver is a layered architecture implementing the ELM327 protocol for vehicle diagnostics.

## Architecture Layers

```
Application Layer (REST, WebSocket, CLI, UI)
             ↓
    Elm327Driver (DeviceObd)
             ↓
    Transport Layer (Serial/Mock)
             ↓
    Physical OBD-II Adapter (ELM327)
             ↓
    Vehicle ECU
```

## Core Components

1. **Elm327Driver** (723 lines)
   - Command queue with priorities
   - Retry logic with exponential backoff
   - Reconnection management
   - Event system
   - Status management
   - Metrics collection

2. **Transport Layer**
   - SerialPortTransport (Production)
   - DevTransport (DEV mode)
   - BluetoothTransport (Future)

3. **Parsers**
   - DtcParser: SAE J2012 compliant
   - PidParser: 50+ PID formulas

4. **Database**
   - DTC codes with descriptions
   - PID definitions with formulas

## Status State Machine

States: DISCONNECTED → CONNECTING → INITIALIZING → READY → IDLE ↔ SCANNING
Error states: ERROR, UNAVAILABLE

## Key Flows

### Initialization
1. Open transport
2. Send AT commands (ATZ, ATE0, ATL0, ATS0, ATH0, ATSP0)
3. Query supported PIDs (0100)
4. Transition to READY

### Read DTC
1. Send Mode 03 command
2. Parse response
3. Lookup descriptions
4. Return DTC entries

### Clear DTC
1. Send Mode 04 command
2. Log operation
3. Return success status

### Read PID
1. Verify PID support
2. Send Mode 01 command
3. Parse response with formula
4. Return PID value

## Error Handling

- Automatic retry: 3 attempts with backoff (500ms → 1000ms → 2000ms)
- Reconnection: Exponential backoff to 60s max
- Custom errors: ObdConnectionError, ObdTimeoutError, ObdParseError, ObdUnsupportedError

## Metrics

13 Prometheus metrics covering:
- Connections
- Operations (DTC read/clear, PID read)
- Errors
- Performance (latency, duration)

## DEV Mode

Uses DevTransport mock for testing without hardware:
- Mock AT command responses
- Mock DTC data (P0133, P0044)
- Mock PID values
- No fake diagnostic generation

## Integration Points

1. DeviceObd interface
2. Event system (8 events)
3. Prometheus metrics
4. JSON configuration
5. Custom error classes

## Next Integration

Ready for:
- REST API endpoints
- WebSocket streaming
- UI dashboard
- Lock control
- Payment flow
- Report generation

---
For detailed information, see `03-apps/02-application/kiosk-agent/src/devices/obd/driver/README.md`
