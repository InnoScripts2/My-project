/**
 * PID Database
 * Ported from node-bluetooth-obd-master (Apache-2.0 license)
 * Contains PID definitions with conversion formulas
 */

import type { PidDefinition, ObdMode, PidIdentifier } from './types.js';

/**
 * Complete PID database with 50+ standard OBD-II parameters
 */
const PIDS: readonly PidDefinition[] = [
  // Mode 01 - Current Data
  {
    mode: '01',
    pid: '0C',
    bytes: 2,
    name: 'Engine RPM',
    description: 'Engine revolutions per minute',
    min: 0,
    max: 16383,
    unit: 'rpm',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return (a * 256 + b) / 4;
    },
  },
  {
    mode: '01',
    pid: '0D',
    bytes: 1,
    name: 'Vehicle Speed',
    description: 'Vehicle speed in km/h',
    min: 0,
    max: 255,
    unit: 'km/h',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16);
    },
  },
  {
    mode: '01',
    pid: '05',
    bytes: 1,
    name: 'Engine Coolant Temperature',
    description: 'Coolant temperature',
    min: -40,
    max: 215,
    unit: '°C',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16) - 40;
    },
  },
  {
    mode: '01',
    pid: '0F',
    bytes: 1,
    name: 'Intake Air Temperature',
    description: 'Temperature of intake air',
    min: -40,
    max: 215,
    unit: '°C',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16) - 40;
    },
  },
  {
    mode: '01',
    pid: '11',
    bytes: 1,
    name: 'Throttle Position',
    description: 'Throttle position percentage',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '2F',
    bytes: 1,
    name: 'Fuel Tank Level',
    description: 'Fuel tank level percentage',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '46',
    bytes: 1,
    name: 'Ambient Air Temperature',
    description: 'Ambient air temperature',
    min: -40,
    max: 215,
    unit: '°C',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16) - 40;
    },
  },
  {
    mode: '01',
    pid: '04',
    bytes: 1,
    name: 'Calculated Engine Load',
    description: 'Calculated engine load value',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '0A',
    bytes: 1,
    name: 'Fuel Pressure',
    description: 'Fuel rail pressure',
    min: 0,
    max: 765,
    unit: 'kPa',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16) * 3;
    },
  },
  {
    mode: '01',
    pid: '0B',
    bytes: 1,
    name: 'Intake Manifold Pressure',
    description: 'Intake manifold absolute pressure',
    min: 0,
    max: 255,
    unit: 'kPa',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16);
    },
  },
  {
    mode: '01',
    pid: '10',
    bytes: 2,
    name: 'MAF Air Flow Rate',
    description: 'Mass air flow sensor rate',
    min: 0,
    max: 655,
    unit: 'g/s',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return (a * 256 + b) / 100;
    },
  },
  {
    mode: '01',
    pid: '21',
    bytes: 2,
    name: 'Distance with MIL on',
    description: 'Distance traveled with MIL on',
    min: 0,
    max: 65535,
    unit: 'km',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return a * 256 + b;
    },
  },
  {
    mode: '01',
    pid: '31',
    bytes: 2,
    name: 'Distance since codes cleared',
    description: 'Distance traveled since codes cleared',
    min: 0,
    max: 65535,
    unit: 'km',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return a * 256 + b;
    },
  },
  {
    mode: '01',
    pid: '06',
    bytes: 1,
    name: 'Short Term Fuel Trim Bank 1',
    description: 'Short term fuel trim percentage',
    min: -100,
    max: 99.2,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a - 128) * 100 / 128;
    },
  },
  {
    mode: '01',
    pid: '07',
    bytes: 1,
    name: 'Long Term Fuel Trim Bank 1',
    description: 'Long term fuel trim percentage',
    min: -100,
    max: 99.2,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a - 128) * 100 / 128;
    },
  },
  {
    mode: '01',
    pid: '08',
    bytes: 1,
    name: 'Short Term Fuel Trim Bank 2',
    description: 'Short term fuel trim percentage bank 2',
    min: -100,
    max: 99.2,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a - 128) * 100 / 128;
    },
  },
  {
    mode: '01',
    pid: '09',
    bytes: 1,
    name: 'Long Term Fuel Trim Bank 2',
    description: 'Long term fuel trim percentage bank 2',
    min: -100,
    max: 99.2,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a - 128) * 100 / 128;
    },
  },
  {
    mode: '01',
    pid: '0E',
    bytes: 1,
    name: 'Timing Advance',
    description: 'Timing advance before TDC',
    min: -64,
    max: 63.5,
    unit: '°',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a - 128) / 2;
    },
  },
  {
    mode: '01',
    pid: '1F',
    bytes: 2,
    name: 'Run time since engine start',
    description: 'Run time since engine start',
    min: 0,
    max: 65535,
    unit: 'seconds',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return a * 256 + b;
    },
  },
  {
    mode: '01',
    pid: '33',
    bytes: 1,
    name: 'Barometric Pressure',
    description: 'Absolute barometric pressure',
    min: 0,
    max: 255,
    unit: 'kPa',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16);
    },
  },
  {
    mode: '01',
    pid: '42',
    bytes: 2,
    name: 'Control Module Voltage',
    description: 'Control module voltage',
    min: 0,
    max: 65.535,
    unit: 'V',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return (a * 256 + b) / 1000;
    },
  },
  {
    mode: '01',
    pid: '43',
    bytes: 2,
    name: 'Absolute Load Value',
    description: 'Absolute load value',
    min: 0,
    max: 25700,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return (a * 256 + b) * 100 / 255;
    },
  },
  {
    mode: '01',
    pid: '44',
    bytes: 2,
    name: 'Fuel Air Commanded Equivalence Ratio',
    description: 'Commanded equivalence ratio',
    min: 0,
    max: 2,
    unit: 'ratio',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return (a * 256 + b) / 32768;
    },
  },
  {
    mode: '01',
    pid: '45',
    bytes: 1,
    name: 'Relative Throttle Position',
    description: 'Relative throttle position',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '47',
    bytes: 1,
    name: 'Absolute Throttle Position B',
    description: 'Absolute throttle position B',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '48',
    bytes: 1,
    name: 'Absolute Throttle Position C',
    description: 'Absolute throttle position C',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '49',
    bytes: 1,
    name: 'Accelerator Pedal Position D',
    description: 'Accelerator pedal position D',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '4A',
    bytes: 1,
    name: 'Accelerator Pedal Position E',
    description: 'Accelerator pedal position E',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '4B',
    bytes: 1,
    name: 'Accelerator Pedal Position F',
    description: 'Accelerator pedal position F',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '4C',
    bytes: 1,
    name: 'Commanded Throttle Actuator',
    description: 'Commanded throttle actuator',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '4D',
    bytes: 2,
    name: 'Time run with MIL on',
    description: 'Time run with MIL on',
    min: 0,
    max: 65535,
    unit: 'minutes',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return a * 256 + b;
    },
  },
  {
    mode: '01',
    pid: '4E',
    bytes: 2,
    name: 'Time since codes cleared',
    description: 'Time since trouble codes cleared',
    min: 0,
    max: 65535,
    unit: 'minutes',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return a * 256 + b;
    },
  },
  {
    mode: '01',
    pid: '51',
    bytes: 1,
    name: 'Fuel Type',
    description: 'Type of fuel currently being used',
    min: 0,
    max: 23,
    unit: 'encoded',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16);
    },
  },
  {
    mode: '01',
    pid: '52',
    bytes: 1,
    name: 'Ethanol Fuel Percentage',
    description: 'Ethanol fuel percentage',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '5A',
    bytes: 1,
    name: 'Relative Accelerator Pedal Position',
    description: 'Relative accelerator pedal position',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '5B',
    bytes: 1,
    name: 'Hybrid Battery Pack Remaining Life',
    description: 'Hybrid battery pack remaining life',
    min: 0,
    max: 100,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return (a * 100) / 255;
    },
  },
  {
    mode: '01',
    pid: '5C',
    bytes: 1,
    name: 'Engine Oil Temperature',
    description: 'Engine oil temperature',
    min: -40,
    max: 210,
    unit: '°C',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16) - 40;
    },
  },
  {
    mode: '01',
    pid: '5D',
    bytes: 2,
    name: 'Fuel Injection Timing',
    description: 'Fuel injection timing',
    min: -210,
    max: 301.992,
    unit: '°',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return ((a * 256 + b) - 26880) / 128;
    },
  },
  {
    mode: '01',
    pid: '5E',
    bytes: 2,
    name: 'Engine Fuel Rate',
    description: 'Engine fuel rate',
    min: 0,
    max: 3212.75,
    unit: 'L/h',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return (a * 256 + b) * 0.05;
    },
  },
  {
    mode: '01',
    pid: '61',
    bytes: 1,
    name: 'Driver Demand Engine Torque',
    description: 'Driver demand engine torque',
    min: -125,
    max: 130,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16) - 125;
    },
  },
  {
    mode: '01',
    pid: '62',
    bytes: 1,
    name: 'Actual Engine Torque',
    description: 'Actual engine torque',
    min: -125,
    max: 130,
    unit: '%',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16) - 125;
    },
  },
  {
    mode: '01',
    pid: '63',
    bytes: 2,
    name: 'Engine Reference Torque',
    description: 'Engine reference torque',
    min: 0,
    max: 65535,
    unit: 'Nm',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return a * 256 + b;
    },
  },
  {
    mode: '01',
    pid: '66',
    bytes: 1,
    name: 'Mass Air Flow Sensor',
    description: 'Mass air flow sensor',
    min: 0,
    max: 255,
    unit: 'g/s',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString, 16);
      return a / 32;
    },
  },
  {
    mode: '01',
    pid: '67',
    bytes: 1,
    name: 'Engine Coolant Temperature',
    description: 'Engine coolant temperature',
    min: -40,
    max: 215,
    unit: '°C',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16) - 40;
    },
  },
  {
    mode: '01',
    pid: '68',
    bytes: 1,
    name: 'Intake Air Temperature Sensor',
    description: 'Intake air temperature sensor',
    min: -40,
    max: 215,
    unit: '°C',
    convertToUseful: (hexString: string): number => {
      return parseInt(hexString, 16) - 40;
    },
  },
  {
    mode: '01',
    pid: '7C',
    bytes: 2,
    name: 'Diesel Particulate Filter Temperature',
    description: 'DPF temperature',
    min: -40,
    max: 6513.5,
    unit: '°C',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return (a * 256 + b) / 10 - 40;
    },
  },
  {
    mode: '01',
    pid: '7F',
    bytes: 2,
    name: 'Engine Run Time',
    description: 'Engine run time',
    min: 0,
    max: 65535,
    unit: 'seconds',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return a * 256 + b;
    },
  },
  {
    mode: '01',
    pid: '83',
    bytes: 2,
    name: 'NOx Sensor Concentration',
    description: 'NOx sensor concentration',
    min: 0,
    max: 655.35,
    unit: 'ppm',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return (a * 256 + b) / 100;
    },
  },
  {
    mode: '01',
    pid: 'A4',
    bytes: 2,
    name: 'Transmission Actual Gear',
    description: 'Transmission actual gear',
    min: 0,
    max: 65535,
    unit: 'ratio',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return (a * 256 + b) / 1000;
    },
  },
  {
    mode: '01',
    pid: 'A6',
    bytes: 2,
    name: 'Odometer',
    description: 'Odometer',
    min: 0,
    max: 429496729.5,
    unit: 'km',
    convertToUseful: (hexString: string): number => {
      const a = parseInt(hexString.substring(0, 2), 16);
      const b = parseInt(hexString.substring(2, 4), 16);
      return (a * 256 + b) / 10;
    },
  },
] as const;

/**
 * PID Database class
 * Provides methods to query and validate PIDs
 */
export class PidDatabase {
  private readonly pids: readonly PidDefinition[];

  constructor() {
    this.pids = PIDS;
  }

  /**
   * Get PID definition by name
   */
  getPidByName(name: string): PidDefinition | undefined {
    return this.pids.find((pid) => pid.name === name);
  }

  /**
   * Get PID definition by mode and PID identifier
   */
  getPidByModeAndPid(mode: ObdMode, pid: PidIdentifier): PidDefinition | undefined {
    return this.pids.find((p) => p.mode === mode && p.pid.toUpperCase() === pid.toUpperCase());
  }

  /**
   * Get all PIDs (returns a copy)
   */
  getAllPids(): PidDefinition[] {
    return [...this.pids];
  }

  /**
   * Get PIDs by mode
   */
  getPidsByMode(mode: ObdMode): PidDefinition[] {
    return this.pids.filter((pid) => pid.mode === mode);
  }

  /**
   * Validate that a PID exists by name
   */
  validatePidExists(name: string): boolean {
    return this.pids.some((pid) => pid.name === name);
  }
}
