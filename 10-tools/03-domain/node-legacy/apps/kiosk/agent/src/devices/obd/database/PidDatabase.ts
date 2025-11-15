import { Pid } from '../types/ObdTypes.js';

/**
 * База данных PIDs для OBD-II диагностики
 * Интегрированы данные из node-bluetooth-obd-master и node-obd2-master
 *
 * Источники:
 * - SAE J1979 стандарт OBD-II PIDs
 * - node-bluetooth-obd-master/lib/obdInfo.js
 * - node-obd2-master PIDs расширения
 */

/**
 * Стандартные PIDs Mode 01 (текущие данные)
 */
export const STANDARD_PIDS: Record<string, Pid> = {
  // 0C - Engine RPM
  'rpm': {
    name: 'rpm',
    mode: '01',
    pid: '0C',
    description: 'Engine RPM',
    min: 0,
    max: 16383.75,
    unit: 'RPM',
    bytes: 2,
    convertToUseful: (byteA: number, byteB?: number) => {
      return ((byteA * 256) + (byteB || 0)) / 4;
    }
  },

  // 0D - Vehicle Speed
  'vss': {
    name: 'vss',
    mode: '01',
    pid: '0D',
    description: 'Vehicle Speed',
    min: 0,
    max: 255,
    unit: 'km/h',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return byteA;
    }
  },

  // 05 - Engine Coolant Temperature
  'temp': {
    name: 'temp',
    mode: '01',
    pid: '05',
    description: 'Engine Coolant Temperature',
    min: -40,
    max: 215,
    unit: '°C',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return byteA - 40;
    }
  },

  // 04 - Engine Load
  'load_pct': {
    name: 'load_pct',
    mode: '01',
    pid: '04',
    description: 'Calculated Engine Load',
    min: 0,
    max: 100,
    unit: '%',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return (byteA * 100) / 255;
    }
  },

  // 0B - Intake Manifold Pressure
  'map': {
    name: 'map',
    mode: '01',
    pid: '0B',
    description: 'Intake Manifold Absolute Pressure',
    min: 0,
    max: 255,
    unit: 'kPa',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return byteA;
    }
  },

  // 0F - Intake Air Temperature
  'iat': {
    name: 'iat',
    mode: '01',
    pid: '0F',
    description: 'Intake Air Temperature',
    min: -40,
    max: 215,
    unit: '°C',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return byteA - 40;
    }
  },

  // 10 - Mass Air Flow
  'maf': {
    name: 'maf',
    mode: '01',
    pid: '10',
    description: 'Mass Air Flow Rate',
    min: 0,
    max: 655.35,
    unit: 'g/s',
    bytes: 2,
    convertToUseful: (byteA: number, byteB?: number) => {
      return ((byteA * 256) + (byteB || 0)) / 100;
    }
  },

  // 11 - Throttle Position
  'throttlepos': {
    name: 'throttlepos',
    mode: '01',
    pid: '11',
    description: 'Throttle Position',
    min: 0,
    max: 100,
    unit: '%',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return (byteA * 100) / 255;
    }
  },

  // 06 - Short Term Fuel Trim Bank 1
  'stft_bank1': {
    name: 'stft_bank1',
    mode: '01',
    pid: '06',
    description: 'Short Term Fuel Trim Bank 1',
    min: -100,
    max: 99.22,
    unit: '%',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return (byteA - 128) * 100 / 128;
    }
  },

  // 07 - Long Term Fuel Trim Bank 1
  'ltft_bank1': {
    name: 'ltft_bank1',
    mode: '01',
    pid: '07',
    description: 'Long Term Fuel Trim Bank 1',
    min: -100,
    max: 99.22,
    unit: '%',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return (byteA - 128) * 100 / 128;
    }
  },

  // 0A - Fuel Pressure
  'fuel_pres': {
    name: 'fuel_pres',
    mode: '01',
    pid: '0A',
    description: 'Fuel Pressure',
    min: 0,
    max: 765,
    unit: 'kPa',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return byteA * 3;
    }
  },

  // 23 - Fuel Rail Pressure
  'frp': {
    name: 'frp',
    mode: '01',
    pid: '23',
    description: 'Fuel Rail Pressure',
    min: 0,
    max: 5177.265,
    unit: 'kPa',
    bytes: 2,
    convertToUseful: (byteA: number, byteB?: number) => {
      return ((byteA * 256) + (byteB || 0)) * 0.079;
    }
  },

  // 1F - Runtime Since Engine Start
  'runtime': {
    name: 'runtime',
    mode: '01',
    pid: '1F',
    description: 'Runtime Since Engine Start',
    min: 0,
    max: 65535,
    unit: 'seconds',
    bytes: 2,
    convertToUseful: (byteA: number, byteB?: number) => {
      return (byteA * 256) + (byteB || 0);
    }
  },

  // 21 - Distance Traveled with MIL On
  'mil_dist': {
    name: 'mil_dist',
    mode: '01',
    pid: '21',
    description: 'Distance Traveled with MIL On',
    min: 0,
    max: 65535,
    unit: 'km',
    bytes: 2,
    convertToUseful: (byteA: number, byteB?: number) => {
      return (byteA * 256) + (byteB || 0);
    }
  },

  // 2F - Fuel Tank Level Input
  'fuel_level': {
    name: 'fuel_level',
    mode: '01',
    pid: '2F',
    description: 'Fuel Tank Level Input',
    min: 0,
    max: 100,
    unit: '%',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return (byteA * 100) / 255;
    }
  },

  // 31 - Distance Traveled Since Codes Cleared
  'dist_clear': {
    name: 'dist_clear',
    mode: '01',
    pid: '31',
    description: 'Distance Traveled Since Codes Cleared',
    min: 0,
    max: 65535,
    unit: 'km',
    bytes: 2,
    convertToUseful: (byteA: number, byteB?: number) => {
      return (byteA * 256) + (byteB || 0);
    }
  }
};

/**
 * Расширенные PIDs из node-obd2-master
 */
export const EXTENDED_PIDS: Record<string, Pid> = {
  // 42 - Control Module Voltage
  'voltage': {
    name: 'voltage',
    mode: '01',
    pid: '42',
    description: 'Control Module Voltage',
    min: 0,
    max: 65.535,
    unit: 'V',
    bytes: 2,
    convertToUseful: (byteA: number, byteB?: number) => {
      return ((byteA * 256) + (byteB || 0)) / 1000;
    }
  },

  // 43 - Absolute Load Value
  'abs_load': {
    name: 'abs_load',
    mode: '01',
    pid: '43',
    description: 'Absolute Load Value',
    min: 0,
    max: 25700,
    unit: '%',
    bytes: 2,
    convertToUseful: (byteA: number, byteB?: number) => {
      return ((byteA * 256) + (byteB || 0)) * 100 / 255;
    }
  },

  // 44 - Fuel-Air Equivalence Ratio
  'lambda': {
    name: 'lambda',
    mode: '01',
    pid: '44',
    description: 'Fuel-Air Equivalence Ratio',
    min: 0,
    max: 2,
    unit: 'λ',
    bytes: 2,
    convertToUseful: (byteA: number, byteB?: number) => {
      return ((byteA * 256) + (byteB || 0)) / 32768;
    }
  },

  // 45 - Relative Throttle Position
  'rel_throttle': {
    name: 'rel_throttle',
    mode: '01',
    pid: '45',
    description: 'Relative Throttle Position',
    min: 0,
    max: 100,
    unit: '%',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return (byteA * 100) / 255;
    }
  },

  // 46 - Ambient Air Temperature
  'ambient_temp': {
    name: 'ambient_temp',
    mode: '01',
    pid: '46',
    description: 'Ambient Air Temperature',
    min: -40,
    max: 215,
    unit: '°C',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return byteA - 40;
    }
  },

  // 47 - Absolute Throttle Position B
  'abs_throttle_b': {
    name: 'abs_throttle_b',
    mode: '01',
    pid: '47',
    description: 'Absolute Throttle Position B',
    min: 0,
    max: 100,
    unit: '%',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return (byteA * 100) / 255;
    }
  },

  // 49 - Accelerator Pedal Position D
  'accel_d': {
    name: 'accel_d',
    mode: '01',
    pid: '49',
    description: 'Accelerator Pedal Position D',
    min: 0,
    max: 100,
    unit: '%',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return (byteA * 100) / 255;
    }
  },

  // 4A - Accelerator Pedal Position E
  'accel_e': {
    name: 'accel_e',
    mode: '01',
    pid: '4A',
    description: 'Accelerator Pedal Position E',
    min: 0,
    max: 100,
    unit: '%',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return (byteA * 100) / 255;
    }
  },

  // 4C - Commanded Throttle Actuator
  'cmd_throttle': {
    name: 'cmd_throttle',
    mode: '01',
    pid: '4C',
    description: 'Commanded Throttle Actuator',
    min: 0,
    max: 100,
    unit: '%',
    bytes: 1,
    convertToUseful: (byteA: number) => {
      return (byteA * 100) / 255;
    }
  }
};

/**
 * Объединенная база PIDs
 */
export const ALL_PIDS: Record<string, Pid> = {
  ...STANDARD_PIDS,
  ...EXTENDED_PIDS
};

/**
 * Класс для работы с базой данных PIDs
 */
export class PidDatabase {
  private pids: Record<string, Pid>;

  constructor(customPids?: Record<string, Pid>) {
    this.pids = customPids || ALL_PIDS;
  }

  /**
   * Получить PID по имени
   */
  getPidByName(name: string): Pid | null {
    return this.pids[name] || null;
  }

  /**
   * Получить PID по коду
   */
  getPidByCode(mode: string, pid: string): Pid | null {
    return Object.values(this.pids).find(p => p.mode === mode && p.pid === pid) || null;
  }

  /**
   * Получить все PIDs
   */
  getAllPids(): Pid[] {
    return Object.values(this.pids);
  }

  /**
   * Получить PIDs по режиму
   */
  getPidsByMode(mode: string): Pid[] {
    return Object.values(this.pids).filter(p => p.mode === mode);
  }

  /**
   * Проверить поддержку PID по имени
   */
  isSupported(name: string): boolean {
    return name in this.pids;
  }

  /**
   * Получить функцию преобразования для PID
   */
  getConversionFunction(name: string): ((byteA: number, byteB?: number, byteC?: number, byteD?: number) => number) | null {
    const pid = this.getPidByName(name);
    return pid ? pid.convertToUseful : null;
  }

  /**
   * Добавить кастомный PID
   */
  addCustomPid(name: string, pid: Pid): void {
    this.pids[name] = pid;
  }

  /**
   * Получить статистику по базе PIDs
   */
  getStats(): { total: number; byMode: Record<string, number> } {
    const byMode: Record<string, number> = {};

    Object.values(this.pids).forEach(pid => {
      byMode[pid.mode] = (byMode[pid.mode] || 0) + 1;
    });

    return {
      total: Object.keys(this.pids).length,
      byMode
    };
  }
}

// Экспорт экземпляра по умолчанию
export const pidDatabase = new PidDatabase();
