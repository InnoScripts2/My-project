import { EventEmitter } from 'events';

/**
 * Базовая структура для PID (Parameter ID) в OBD-II
 */
export interface Pid {
  /** Человеко-читаемое имя параметра */
  name: string;
  /** Режим OBD-II (01, 02, 03, etc.) */
  mode: string;
  /** Hex код PID */
  pid: string;
  /** Описание параметра */
  description: string;
  /** Минимальное значение */
  min: number;
  /** Максимальное значение */
  max: number;
  /** Единица измерения */
  unit: string;
  /** Количество байт данных */
  bytes: number;
  /** Функция преобразования сырых байт в полезное значение */
  convertToUseful: (byteA: number, byteB?: number, byteC?: number, byteD?: number) => number;
}

/**
 * Ответ от OBD-II адаптера после чтения PID
 */
export interface PidResponse {
  /** Преобразованное значение */
  value: number | string;
  /** Имя параметра */
  name?: string;
  /** Режим OBD-II */
  mode?: string;
  /** Hex код PID */
  pid?: string;
  /** Единица измерения */
  unit?: string;
  /** Временная метка получения данных */
  timestamp: number;
  /** Сырые байты от адаптера */
  rawBytes?: string;
}

/**
 * Конфигурация для OBD соединения
 */
export interface ObdConfig {
  /** Тип транспорта: serial, bluetooth, usb */
  transport: 'serial' | 'bluetooth' | 'usb';
  /** Порт подключения (COM3, /dev/ttyUSB0, etc.) */
  port: string;
  /** Baudrate для serial соединения */
  baudrate?: number;
  /** Таймаут команд в миллисекундах */
  timeout?: number;
  /** Количество повторов при ошибке */
  retries?: number;
}

/**
 * Запись кода неисправности (DTC)
 */
export interface DtcEntry {
  /** Код неисправности (P0171, C1234, etc.) */
  code: string;
  /** Категория: P (powertrain), C (chassis), B (body), U (network) */
  category: 'P' | 'C' | 'B' | 'U';
  /** Описание неисправности (если доступно) */
  description?: string;
  /** Сырые байты от адаптера */
  rawBytes: string;
}

/**
 * Статусы OBD соединения
 */
export enum ObdStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  INITIALIZING = 'initializing',
  READY = 'ready',
  SCANNING = 'scanning',
  IDLE = 'idle',
  ERROR = 'error',
  UNAVAILABLE = 'unavailable'
}

/**
 * Интерфейс для OBD устройства
 */
export interface DeviceObd extends EventEmitter {
  /**
   * Инициализация соединения с адаптером
   */
  init(config: ObdConfig): Promise<void>;

  /**
   * Чтение кодов неисправностей (DTC)
   */
  readDtc(): Promise<DtcEntry[]>;

  /**
   * Очистка кодов неисправностей
   */
  clearDtc(): Promise<boolean>;

  /**
   * Чтение значения PID
   */
  readPid(pid: string): Promise<PidResponse>;

  /**
   * Получение текущего статуса
   */
  getStatus(): ObdStatus;

  /**
   * Отключение от адаптера
   */
  disconnect(): Promise<void>;
}

/**
 * Кастомные ошибки OBD
 */
export class ObdConnectionError extends Error {
  constructor(message: string, public code?: string, public details?: any) {
    super(message);
    this.name = 'ObdConnectionError';
    this.timestamp = Date.now();
  }
  public timestamp: number;
}

export class ObdTimeoutError extends Error {
  constructor(message: string, public command?: string) {
    super(message);
    this.name = 'ObdTimeoutError';
    this.timestamp = Date.now();
  }
  public timestamp: number;
}

export class ObdParseError extends Error {
  constructor(message: string, public rawData?: string) {
    super(message);
    this.name = 'ObdParseError';
    this.timestamp = Date.now();
  }
  public timestamp: number;
}

export class ObdUnsupportedError extends Error {
  constructor(message: string, public pid?: string) {
    super(message);
    this.name = 'ObdUnsupportedError';
    this.timestamp = Date.now();
  }
  public timestamp: number;
}
