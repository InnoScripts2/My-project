/**
 * Общие интерфейсы устройств
 */

import { EventEmitter } from 'events';

export enum DeviceState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  READY = 'ready',
  BUSY = 'busy',
  ERROR = 'error',
}

export interface DeviceHealthStatus {
  state: DeviceState;
  connected: boolean;
  lastConnected?: Date;
  lastError?: string;
  metrics: {
    successRate: number;
    avgResponseTime: number;
    totalOperations: number;
    failedOperations: number;
  };
}

export interface Device extends EventEmitter {
  /**
   * Инициализация устройства
   */
  init(config: any): Promise<void>;

  /**
   * Отключение устройства
   */
  disconnect(): Promise<void>;

  /**
   * Получить состояние устройства
   */
  getState(): DeviceState;

  /**
   * Получить статус здоровья устройства
   */
  getHealthStatus(): DeviceHealthStatus;
}
