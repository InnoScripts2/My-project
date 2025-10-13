/**
 * OBD-II команды ELM327
 * Основаны на спецификации ELM327 и SAE J1979
 */

export interface ObdCommand {
  name: string;
  command: string;
  description: string;
  expectedResponsePattern?: RegExp;
  timeout?: number;
}

/**
 * Инициализационные команды
 */
export const INIT_COMMANDS: ObdCommand[] = [
  {
    name: 'RESET',
    command: 'ATZ',
    description: 'Reset ELM327',
    timeout: 3000,
  },
  {
    name: 'ECHO_OFF',
    command: 'ATE0',
    description: 'Turn echo off',
    timeout: 1000,
  },
  {
    name: 'LINEFEED_OFF',
    command: 'ATL0',
    description: 'Turn linefeeds off',
    timeout: 1000,
  },
  {
    name: 'SPACES_OFF',
    command: 'ATS0',
    description: 'Turn spaces off',
    timeout: 1000,
  },
  {
    name: 'HEADERS_OFF',
    command: 'ATH0',
    description: 'Turn headers off',
    timeout: 1000,
  },
  {
    name: 'AUTO_PROTOCOL',
    command: 'ATSP0',
    description: 'Set protocol to auto',
    timeout: 2000,
  },
];

/**
 * Команды диагностики
 */
export const DIAGNOSTIC_COMMANDS = {
  /**
   * Чтение DTC (Mode 03)
   */
  READ_DTC: {
    name: 'READ_DTC',
    command: '03',
    description: 'Read stored diagnostic trouble codes',
    timeout: 5000,
  },

  /**
   * Очистка DTC (Mode 04)
   */
  CLEAR_DTC: {
    name: 'CLEAR_DTC',
    command: '04',
    description: 'Clear diagnostic trouble codes and stored values',
    timeout: 3000,
  },

  /**
   * Чтение pending DTC (Mode 07)
   */
  READ_PENDING_DTC: {
    name: 'READ_PENDING_DTC',
    command: '07',
    description: 'Read pending diagnostic trouble codes',
    timeout: 5000,
  },

  /**
   * Чтение статуса MIL (Mode 01 PID 01)
   */
  READ_STATUS: {
    name: 'READ_STATUS',
    command: '0101',
    description: 'Read MIL status and number of DTCs',
    timeout: 2000,
  },
} as const;

/**
 * Команды чтения PIDs (Mode 01)
 */
export const PID_COMMANDS = {
  SUPPORTED_PIDS_01_20: {
    name: 'SUPPORTED_PIDS_01_20',
    command: '0100',
    description: 'PIDs supported [01-20]',
    timeout: 2000,
  },
  SUPPORTED_PIDS_21_40: {
    name: 'SUPPORTED_PIDS_21_40',
    command: '0120',
    description: 'PIDs supported [21-40]',
    timeout: 2000,
  },
  SUPPORTED_PIDS_41_60: {
    name: 'SUPPORTED_PIDS_41_60',
    command: '0140',
    description: 'PIDs supported [41-60]',
    timeout: 2000,
  },
  ENGINE_LOAD: {
    name: 'ENGINE_LOAD',
    command: '0104',
    description: 'Calculated engine load',
    timeout: 1000,
  },
  COOLANT_TEMP: {
    name: 'COOLANT_TEMP',
    command: '0105',
    description: 'Engine coolant temperature',
    timeout: 1000,
  },
  RPM: {
    name: 'RPM',
    command: '010C',
    description: 'Engine RPM',
    timeout: 1000,
  },
  SPEED: {
    name: 'SPEED',
    command: '010D',
    description: 'Vehicle speed',
    timeout: 1000,
  },
  THROTTLE_POS: {
    name: 'THROTTLE_POS',
    command: '0111',
    description: 'Throttle position',
    timeout: 1000,
  },
  INTAKE_TEMP: {
    name: 'INTAKE_TEMP',
    command: '010F',
    description: 'Intake air temperature',
    timeout: 1000,
  },
  MAF: {
    name: 'MAF',
    command: '0110',
    description: 'Mass air flow rate',
    timeout: 1000,
  },
} as const;

/**
 * Утилитарные команды
 */
export const UTILITY_COMMANDS = {
  GET_VIN: {
    name: 'GET_VIN',
    command: '0902',
    description: 'Get Vehicle Identification Number (VIN)',
    timeout: 3000,
  },
  GET_PROTOCOL: {
    name: 'GET_PROTOCOL',
    command: 'ATDPN',
    description: 'Describe protocol by number',
    timeout: 1000,
  },
  GET_VOLTAGE: {
    name: 'GET_VOLTAGE',
    command: 'ATRV',
    description: 'Read voltage',
    timeout: 1000,
  },
  GET_VERSION: {
    name: 'GET_VERSION',
    command: 'ATI',
    description: 'Get ELM327 version',
    timeout: 1000,
  },
} as const;

/**
 * Создать команду чтения PID
 */
export function createPidCommand(pid: string): ObdCommand {
  return {
    name: `PID_${pid}`,
    command: `01${pid}`,
    description: `Read PID ${pid}`,
    timeout: 1000,
  };
}

/**
 * Создать команду с кастомным режимом и PID
 */
export function createCustomCommand(mode: string, pid: string, description?: string): ObdCommand {
  return {
    name: `MODE_${mode}_PID_${pid}`,
    command: `${mode}${pid}`,
    description: description || `Mode ${mode} PID ${pid}`,
    timeout: 2000,
  };
}

/**
 * Все команды в одном объекте
 */
export const ALL_COMMANDS = {
  INIT: INIT_COMMANDS,
  DIAGNOSTIC: DIAGNOSTIC_COMMANDS,
  PID: PID_COMMANDS,
  UTILITY: UTILITY_COMMANDS,
} as const;
