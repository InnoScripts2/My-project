# OBD-II Test Fixtures

Real-world ELM327 response frames captured from actual OBD-II adapters.

## Purpose

These fixtures contain actual responses from real OBD-II adapters and vehicles. They are used for:

1. **Unit Testing**: Validate response parsing without hardware
2. **Integration Testing**: Test full command/response cycles
3. **Regression Testing**: Ensure changes don't break existing functionality
4. **Protocol Validation**: Verify compliance with ELM327 specification

## Fixtures Included

### init-sequence.json
Complete initialization sequence from adapter reset to ready state.
- Source: ELM327 v1.5 adapter
- Vehicle: 2015 Toyota Camry
- Protocol: ISO 15765-4 CAN (11 bit, 500 kbaud)

### dtc-responses.json
Various DTC read responses including:
- No codes present
- Single code
- Multiple codes
- Pending codes

### pid-responses.json
Standard Mode 01 PID responses:
- Engine RPM
- Vehicle Speed
- Coolant Temperature
- Throttle Position
- Mass Air Flow
- Etc.

### error-responses.json
Error conditions and malformed responses:
- NO DATA
- SEARCHING...
- BUS INIT ERROR
- CAN ERROR
- Timeout scenarios

### vin-response.json
Vehicle Identification Number (VIN) query responses.

## Data Format

Each fixture file is JSON with the following structure:

```json
{
  "metadata": {
    "description": "Description of this fixture",
    "source": "Hardware/vehicle information",
    "date_captured": "ISO 8601 timestamp",
    "protocol": "OBD protocol used",
    "notes": "Additional context"
  },
  "frames": [
    {
      "command": "AT command or OBD mode/PID",
      "response": "Actual response from adapter",
      "expected": "Expected parsed result",
      "notes": "Frame-specific notes"
    }
  ]
}
```

## Usage in Tests

```typescript
import initSequence from './fixtures/init-sequence.json';

test('Parse init sequence', () => {
  for (const frame of initSequence.frames) {
    const result = parseResponse(frame.response);
    expect(result).toEqual(frame.expected);
  }
});
```

## Capture Guidelines

When adding new fixtures:

1. **Real Hardware Only**: Capture from actual adapters, not simulations
2. **Document Source**: Include adapter model, vehicle year/make/model
3. **Timestamp**: Record when captured
4. **Protocol**: Note which OBD protocol was active
5. **Sanitize VIN**: Replace actual VIN with placeholder if needed
6. **Verify Responses**: Ensure responses are valid per ELM327 spec

## Capture Tools

Fixtures can be captured using:

- `screen` or `minicom` for serial logging
- Custom capture script (see `scripts/capture-obd-frames.ts`)
- Commercial scan tools with logging capability

Example capture command:
```bash
screen -L /dev/ttyUSB0 38400
# Issue commands, responses are logged to screenlog.0
```

## Privacy and Security

- **No Real VINs**: Replace actual VINs with `TESTVIN123456789` or similar
- **No Personal Data**: Ensure no personal information in metadata
- **Public Distribution**: These fixtures are part of the open-source repository

## Standards Compliance

All fixtures are validated against:

- ELM327 Data Sheet (Elm Electronics)
- SAE J1979 - E/E Diagnostic Test Modes
- ISO 15765-4 - Road vehicles CAN

## Contributing Fixtures

To contribute new fixtures:

1. Capture responses from real hardware
2. Create fixture file following the format above
3. Add entry to this README describing the fixture
4. Ensure no sensitive data is included
5. Submit via pull request

## License

These fixtures are factual data from standard OBD-II protocols and are provided for testing purposes under the project's main license.
