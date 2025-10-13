/**
 * Типы и интерфейсы для системы замков выдачи устройств
 */

export type DeviceType = 'thickness' | 'obd';
export type LockStatus = 'locked' | 'unlocked' | 'error' | 'unknown';

/**
 * Базовый интерфейс драйвера замка
 */
export interface Lock {
  open(): Promise<void>;
  close(): Promise<void>;
  getStatus(): Promise<LockStatus>;
}

/**
 * Конфигурация для конкретного замка
 */
export interface LockConfig {
  deviceType: DeviceType;
  driverType: 'mock' | 'serial-relay' | 'gpio';
  driverConfig?: Record<string, unknown>;
  autoCloseMs?: number;
}

/**
 * Снимок состояния замка
 */
export interface LockSnapshot {
  deviceType: DeviceType;
  status: LockStatus;
  locked: boolean;
  autoCloseScheduled: boolean;
  lastActionAt?: string;
  lastOperationKey?: string;
  error?: string;
}

/**
 * Результат операции с замком
 */
export interface LockOperationResult {
  ok: boolean;
  deviceType: DeviceType;
  status: LockStatus;
  actionId?: string;
  error?: string;
}

/**
 * Политика выдачи устройства
 */
export interface DeviceDispensePolicy {
  /**
   * Проверяет, можно ли выдать устройство
   */
  canDispense(deviceType: DeviceType, context?: Record<string, unknown>): Promise<boolean>;
  
  /**
   * Сообщение об ошибке, если выдача невозможна
   */
  getBlockReason(deviceType: DeviceType, context?: Record<string, unknown>): Promise<string | null>;
}
