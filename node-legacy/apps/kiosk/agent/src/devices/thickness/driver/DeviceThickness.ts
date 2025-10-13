/**
 * Интерфейс толщиномера ЛКП
 */

import { EventEmitter } from 'events';
import { Device } from '../../common/interfaces.js';

export interface ThicknessMeasurement {
  zoneId: number;
  zoneName: string;
  value: number;
  unit: 'μm' | 'mils';
  timestamp: number;
}

export interface ThicknessConfig {
  /**
   * Имя устройства для поиска (BLE)
   */
  deviceName?: string;

  /**
   * MAC адрес устройства (опционально)
   */
  deviceAddress?: string;

  /**
   * Общее количество зон для измерения
   */
  totalZones: number;

  /**
   * Таймаут подключения (мс)
   */
  connectionTimeout?: number;

  /**
   * Таймаут измерения одной зоны (мс)
   */
  measurementTimeout?: number;
}

export enum ThicknessState {
  DISCONNECTED = 'disconnected',
  SCANNING = 'scanning',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  READY = 'ready',
  MEASURING = 'measuring',
  ERROR = 'error',
}

export interface DeviceThickness extends Device {
  /**
   * Инициализация толщиномера
   */
  init(config: ThicknessConfig): Promise<void>;

  /**
   * Начать измерения
   */
  startMeasuring(): Promise<void>;

  /**
   * Остановить измерения
   */
  stopMeasuring(): Promise<void>;

  /**
   * Получить все измерения
   */
  getMeasurements(): ThicknessMeasurement[];

  /**
   * Получить состояние толщиномера
   */
  getThicknessState(): ThicknessState;

  /**
   * События:
   * - 'device_detected': устройство обнаружено
   * - 'connected': подключено
   * - 'disconnected': отключено
   * - 'measurement_received': получено измерение
   * - 'measurement_complete': все измерения завершены
   * - 'error': ошибка
   */
}
