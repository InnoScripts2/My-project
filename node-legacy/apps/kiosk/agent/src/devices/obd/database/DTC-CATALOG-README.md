# DTC Catalog - Diagnostic Trouble Codes Database

Comprehensive database of OBD-II diagnostic trouble codes from open standards and public sources.

## Sources and References

This DTC catalog is compiled from the following open and publicly available sources:

### Primary Standards

1. **SAE J2012** - Diagnostic Trouble Code Definitions
   - Public domain standard codes (P0xxx, P2xxx, P3xxx)
   - Generic/standardized manufacturer codes
   - Status: Open standard, publicly documented

2. **ISO 15031-6** - Diagnostic trouble code definitions
   - International standard for OBD-II DTCs
   - Standardized across manufacturers
   - Status: Public specification

3. **SAE J1979** - E/E Diagnostic Test Modes
   - Mode 03 (Request Emission-Related DTC)
   - Mode 07 (Request Emission-Related DTC Detected During Current or Last Completed Driving Cycle)
   - Status: Open standard

### Secondary Sources

4. **OBD-II Code Library** - Community-maintained open database
   - URL: https://github.com/brendan-w/python-OBD
   - License: GPLv3
   - Contains publicly documented standard codes

5. **Wikipedia OBD-II PIDs** - Public reference
   - URL: https://en.wikipedia.org/wiki/OBD-II_PIDs
   - Community-verified standard codes
   - License: Creative Commons

## Code Categories

### P-Codes (Powertrain)
Codes related to engine and transmission systems.

- **P0xxx**: Generic/SAE defined (ISO/SAE controlled)
- **P1xxx**: Manufacturer specific
- **P2xxx**: Generic/SAE defined (ISO/SAE controlled)
- **P3xxx**: Generic/SAE defined (ISO/SAE controlled)

### C-Codes (Chassis)
Codes related to chassis systems (ABS, stability control, etc.)

- **C0xxx**: Generic/SAE defined
- **C1xxx**: Manufacturer specific
- **C2xxx**: Manufacturer specific
- **C3xxx**: Reserved

### B-Codes (Body)
Codes related to body control systems.

- **B0xxx**: Generic/SAE defined
- **B1xxx**: Manufacturer specific
- **B2xxx**: Manufacturer specific
- **B3xxx**: Reserved

### U-Codes (Network/Communication)
Codes related to vehicle network and module communication.

- **U0xxx**: Generic/SAE defined
- **U1xxx**: Manufacturer specific
- **U2xxx**: Manufacturer specific
- **U3xxx**: Reserved

## Severity Levels

Each code is assigned a severity level based on standard classifications:

- **Critical**: Immediate attention required, severe safety or emissions impact
- **High**: Significant issue requiring prompt attention
- **Medium**: Moderate issue, should be addressed soon
- **Low**: Minor issue, monitor and address during regular maintenance

## Usage

```typescript
import { dtcDatabase } from './database/DtcDatabase.js';

// Get DTC information
const info = dtcDatabase.getDtcInfo('P0171');
console.log(info.description); // "System Too Lean (Bank 1)"
console.log(info.severity);    // "medium"
console.log(info.system);      // "Fuel and Air Metering"

// Check if code is known
if (!dtcDatabase.isKnownCode('P9999')) {
  console.log('Unknown manufacturer-specific code');
}

// Get all codes by category
const powertrainCodes = dtcDatabase.getCodesByCategory('P');
```

## Coverage

Current database includes:

- **Powertrain (P)**: 150+ standard codes
- **Chassis (C)**: 20+ standard codes
- **Body (B)**: 10+ standard codes
- **Network (U)**: 15+ standard codes

Total: 195+ documented codes from open sources.

## Updating the Database

The database is maintained manually and periodically updated from public sources.

### Adding New Codes

1. Verify code is from a public/open source
2. Document the source in this README
3. Add code to appropriate category in `DtcDatabase.ts`
4. Include severity and system information

### Update Script

```bash
# Future: Automated update from public APIs
npm run update:dtc-catalog
```

## Manufacturer-Specific Codes

Manufacturer-specific codes (P1xxx, C1xxx, B1xxx, U1xxx) are not included unless:

1. They are publicly documented by the manufacturer
2. They appear in open databases with verified sources
3. They are part of regulatory submissions (EPA, CARB)

## Legal Compliance

All codes in this database are:

- From publicly available standards (SAE, ISO)
- From open-source community databases
- Documented in public regulatory filings
- Not reverse-engineered from proprietary software
- Not extracted from licensed/commercial databases

## Disclaimer

This database provides standard OBD-II codes as documented in public standards. It does not include:

- Proprietary manufacturer diagnostic codes
- Enhanced diagnostic information requiring licensed tools
- Codes from reverse-engineered protocols
- Information from non-public technical service bulletins

## Contributing

To contribute additional codes:

1. Ensure code is from a public source
2. Provide source documentation
3. Include description, severity, and system
4. Submit via pull request with source verification

## License

This DTC catalog compilation is provided under the project's main license. Individual code definitions are from public standards and open databases as documented above.

## References

1. SAE International - https://www.sae.org/standards/
2. ISO Standards - https://www.iso.org/standards.html
3. EPA OBD Requirements - https://www.epa.gov/vehicles
4. CARB OBD Regulations - https://ww2.arb.ca.gov/our-work/programs/obd-program
5. python-OBD Project - https://github.com/brendan-w/python-OBD
