/**
 * База данных кодов неисправностей (DTC) для OBD-II
 *
 * Источники:
 * - SAE J2012 стандарт (публичные коды)
 * - ISO 15031 стандарт
 * - Открытые базы данных
 *
 * Категории:
 * P (Powertrain) - двигатель, трансмиссия
 * C (Chassis) - тормоза, подвеска, рулевое управление
 * B (Body) - кузовная электроника, климат-контроль
 * U (Network) - сетевая коммуникация
 */

export interface DtcCode {
  code: string;
  category: 'P' | 'C' | 'B' | 'U';
  description: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  system?: string;
}

/**
 * Стандартные P-коды (Powertrain)
 */
export const POWERTRAIN_CODES: Record<string, DtcCode> = {
  'P0100': {
    code: 'P0100',
    category: 'P',
    description: 'Mass Air Flow Circuit Malfunction',
    severity: 'medium',
    system: 'Fuel and Air Metering'
  },
  'P0101': {
    code: 'P0101',
    category: 'P',
    description: 'Mass Air Flow Circuit Range/Performance Problem',
    severity: 'medium',
    system: 'Fuel and Air Metering'
  },
  'P0102': {
    code: 'P0102',
    category: 'P',
    description: 'Mass Air Flow Circuit Low Input',
    severity: 'medium',
    system: 'Fuel and Air Metering'
  },
  'P0103': {
    code: 'P0103',
    category: 'P',
    description: 'Mass Air Flow Circuit High Input',
    severity: 'medium',
    system: 'Fuel and Air Metering'
  },
  'P0171': {
    code: 'P0171',
    category: 'P',
    description: 'System Too Lean (Bank 1)',
    severity: 'medium',
    system: 'Fuel and Air Metering'
  },
  'P0172': {
    code: 'P0172',
    category: 'P',
    description: 'System Too Rich (Bank 1)',
    severity: 'medium',
    system: 'Fuel and Air Metering'
  },
  'P0174': {
    code: 'P0174',
    category: 'P',
    description: 'System Too Lean (Bank 2)',
    severity: 'medium',
    system: 'Fuel and Air Metering'
  },
  'P0175': {
    code: 'P0175',
    category: 'P',
    description: 'System Too Rich (Bank 2)',
    severity: 'medium',
    system: 'Fuel and Air Metering'
  },
  'P0300': {
    code: 'P0300',
    category: 'P',
    description: 'Random/Multiple Cylinder Misfire Detected',
    severity: 'high',
    system: 'Ignition System'
  },
  'P0301': {
    code: 'P0301',
    category: 'P',
    description: 'Cylinder 1 Misfire Detected',
    severity: 'high',
    system: 'Ignition System'
  },
  'P0302': {
    code: 'P0302',
    category: 'P',
    description: 'Cylinder 2 Misfire Detected',
    severity: 'high',
    system: 'Ignition System'
  },
  'P0303': {
    code: 'P0303',
    category: 'P',
    description: 'Cylinder 3 Misfire Detected',
    severity: 'high',
    system: 'Ignition System'
  },
  'P0304': {
    code: 'P0304',
    category: 'P',
    description: 'Cylinder 4 Misfire Detected',
    severity: 'high',
    system: 'Ignition System'
  },
  'P0305': {
    code: 'P0305',
    category: 'P',
    description: 'Cylinder 5 Misfire Detected',
    severity: 'high',
    system: 'Ignition System'
  },
  'P0306': {
    code: 'P0306',
    category: 'P',
    description: 'Cylinder 6 Misfire Detected',
    severity: 'high',
    system: 'Ignition System'
  },
  'P0420': {
    code: 'P0420',
    category: 'P',
    description: 'Catalyst System Efficiency Below Threshold (Bank 1)',
    severity: 'medium',
    system: 'Emissions Control'
  },
  'P0430': {
    code: 'P0430',
    category: 'P',
    description: 'Catalyst System Efficiency Below Threshold (Bank 2)',
    severity: 'medium',
    system: 'Emissions Control'
  },
  'P0441': {
    code: 'P0441',
    category: 'P',
    description: 'Evaporative Emission Control System Incorrect Purge Flow',
    severity: 'low',
    system: 'Emissions Control'
  },
  'P0442': {
    code: 'P0442',
    category: 'P',
    description: 'Evaporative Emission Control System Leak Detected (Small Leak)',
    severity: 'low',
    system: 'Emissions Control'
  },
  'P0446': {
    code: 'P0446',
    category: 'P',
    description: 'Evaporative Emission Control System Vent Control Circuit Malfunction',
    severity: 'low',
    system: 'Emissions Control'
  },
  'P0500': {
    code: 'P0500',
    category: 'P',
    description: 'Vehicle Speed Sensor Malfunction',
    severity: 'medium',
    system: 'Vehicle Speed'
  },
  'P0505': {
    code: 'P0505',
    category: 'P',
    description: 'Idle Control System Malfunction',
    severity: 'medium',
    system: 'Idle Air Control'
  },
  'P0506': {
    code: 'P0506',
    category: 'P',
    description: 'Idle Control System RPM Lower Than Expected',
    severity: 'medium',
    system: 'Idle Air Control'
  },
  'P0507': {
    code: 'P0507',
    category: 'P',
    description: 'Idle Control System RPM Higher Than Expected',
    severity: 'medium',
    system: 'Idle Air Control'
  }
};

/**
 * Коды системы шасси (C-коды)
 */
export const CHASSIS_CODES: Record<string, DtcCode> = {
  'C1200': {
    code: 'C1200',
    category: 'C',
    description: 'ABS System Malfunction',
    severity: 'high',
    system: 'Anti-lock Braking System'
  },
  'C1201': {
    code: 'C1201',
    category: 'C',
    description: 'ABS Control Module Malfunction',
    severity: 'high',
    system: 'Anti-lock Braking System'
  },
  'C1234': {
    code: 'C1234',
    category: 'C',
    description: 'Wheel Speed Sensor Circuit Malfunction',
    severity: 'high',
    system: 'Anti-lock Braking System'
  }
};

/**
 * Коды кузовной электроники (B-коды)
 */
export const BODY_CODES: Record<string, DtcCode> = {
  'B1000': {
    code: 'B1000',
    category: 'B',
    description: 'ECU Hardware Malfunction',
    severity: 'critical',
    system: 'Body Control Module'
  },
  'B1001': {
    code: 'B1001',
    category: 'B',
    description: 'ECU Software Version Error',
    severity: 'medium',
    system: 'Body Control Module'
  }
};

/**
 * Коды сетевой коммуникации (U-коды)
 */
export const NETWORK_CODES: Record<string, DtcCode> = {
  'U0100': {
    code: 'U0100',
    category: 'U',
    description: 'Lost Communication with ECM/PCM',
    severity: 'critical',
    system: 'Communication Network'
  },
  'U0101': {
    code: 'U0101',
    category: 'U',
    description: 'Lost Communication with TCM',
    severity: 'high',
    system: 'Communication Network'
  },
  'U0121': {
    code: 'U0121',
    category: 'U',
    description: 'Lost Communication with ABS Control Module',
    severity: 'high',
    system: 'Communication Network'
  }
};

/**
 * Объединенная база DTC кодов
 */
export const ALL_DTC_CODES: Record<string, DtcCode> = {
  ...POWERTRAIN_CODES,
  ...CHASSIS_CODES,
  ...BODY_CODES,
  ...NETWORK_CODES
};

/**
 * Класс для работы с базой данных DTC кодов
 */
export class DtcDatabase {
  private codes: Record<string, DtcCode>;

  constructor(customCodes?: Record<string, DtcCode>) {
    this.codes = customCodes || ALL_DTC_CODES;
  }

  /**
   * Получить описание DTC кода
   */
  getDtcDescription(code: string): string | undefined {
    return this.codes[code]?.description;
  }

  /**
   * Получить полную информацию о DTC коде
   */
  getDtcInfo(code: string): DtcCode | null {
    return this.codes[code] || null;
  }

  /**
   * Получить все коды по категории
   */
  getCodesByCategory(category: 'P' | 'C' | 'B' | 'U'): DtcCode[] {
    return Object.values(this.codes).filter(code => code.category === category);
  }

  /**
   * Получить коды по системе
   */
  getCodesBySystem(system: string): DtcCode[] {
    return Object.values(this.codes).filter(code => code.system === system);
  }

  /**
   * Получить коды по уровню серьезности
   */
  getCodesBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): DtcCode[] {
    return Object.values(this.codes).filter(code => code.severity === severity);
  }

  /**
   * Проверить, известен ли код в базе
   */
  isKnownCode(code: string): boolean {
    return code in this.codes;
  }

  /**
   * Добавить кастомный DTC код
   */
  addCustomCode(code: DtcCode): void {
    this.codes[code.code] = code;
  }

  /**
   * Определить категорию по коду
   */
  getCategoryFromCode(code: string): 'P' | 'C' | 'B' | 'U' | null {
    if (code.length < 1) return null;

    const prefix = code.charAt(0).toUpperCase();
    if (['P', 'C', 'B', 'U'].includes(prefix)) {
      return prefix as 'P' | 'C' | 'B' | 'U';
    }

    return null;
  }

  /**
   * Получить статистику по базе DTC
   */
  getStats(): {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    Object.values(this.codes).forEach(code => {
      byCategory[code.category] = (byCategory[code.category] || 0) + 1;
      if (code.severity) {
        bySeverity[code.severity] = (bySeverity[code.severity] || 0) + 1;
      }
    });

    return {
      total: Object.keys(this.codes).length,
      byCategory,
      bySeverity
    };
  }

  /**
   * Поиск кодов по тексту описания
   */
  searchByDescription(query: string): DtcCode[] {
    const searchTerm = query.toLowerCase();
    return Object.values(this.codes).filter(code =>
      code.description.toLowerCase().includes(searchTerm)
    );
  }
}

// Экспорт экземпляра по умолчанию
export const dtcDatabase = new DtcDatabase();
