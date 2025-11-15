/**
 * Контроллер замков выдачи устройств
 * Управляет несколькими слотами (thickness, obd), обеспечивает таймауты auto-close и логирование
 */

import type { Lock, LockConfig, LockSnapshot, LockOperationResult, DeviceType, DeviceDispensePolicy } from './types.js';
import { MockLockDriver } from './MockLockDriver.js';
import { SerialRelayLockDriver } from './SerialRelayLockDriver.js';
import { GpioLockDriver } from './GpioLockDriver.js';
import { centralizedLogger } from '../logging/CentralizedLogger.js';

interface LockSlot {
  lock: Lock;
  config: LockConfig;
  timer?: NodeJS.Timeout;
  lastActionAt?: string;
  lastActionId?: string; // ID последней успешной операции
  operationInProgress?: string; // idempotency key
}

export class LockController {
  private readonly slots = new Map<DeviceType, LockSlot>();
  private readonly policy?: DeviceDispensePolicy;

  constructor(configs: LockConfig[], policy?: DeviceDispensePolicy) {
    this.policy = policy;
    this.initializeLocks(configs);
  }

  private initializeLocks(configs: LockConfig[]): void {
    for (const config of configs) {
      const lock = this.createLockDriver(config);
      this.slots.set(config.deviceType, {
        lock,
        config,
      });
      centralizedLogger.info('locks', `Инициализирован замок для ${config.deviceType}`, {
        context: { driverType: config.driverType },
      });
    }
  }

  private createLockDriver(config: LockConfig): Lock {
    switch (config.driverType) {
      case 'mock':
        return new MockLockDriver(config.driverConfig);
      case 'serial-relay':
        return new SerialRelayLockDriver(config.driverConfig as any);
      case 'gpio':
        return new GpioLockDriver(config.driverConfig as any);
      default:
        throw new Error(`Unsupported lock driver type: ${config.driverType}`);
    }
  }

  /**
   * Открывает замок для выдачи устройства
   * Поддерживает idempotency через operationKey
   */
  async openSlot(
    deviceType: DeviceType,
    options?: {
      operationKey?: string;
      autoCloseMs?: number;
      context?: Record<string, unknown>;
    }
  ): Promise<LockOperationResult> {
    const slot = this.slots.get(deviceType);
    if (!slot) {
      centralizedLogger.error('locks', `Замок для ${deviceType} не найден`);
      return {
        ok: false,
        deviceType,
        status: 'error',
        error: 'lock_not_found',
      };
    }

    // Проверка idempotency - если уже выполнялась операция с таким ключом
    if (options?.operationKey) {
      // Проверяем, выполняется ли сейчас операция с этим ключом
      if (slot.operationInProgress === options.operationKey) {
        const status = await slot.lock.getStatus();
        centralizedLogger.debug('locks', `Повторный запрос на открытие ${deviceType} с тем же ключом (в процессе)`, {
          context: { operationKey: options.operationKey, status },
        });
        return {
          ok: status === 'unlocked',
          deviceType,
          status,
          actionId: slot.lastActionId, // Возвращаем сохранённый actionId
        };
      }
      
      // Проверяем, не была ли операция уже успешно завершена ранее
      // (используем lastActionId как маркер завершенных операций)
      if (slot.lastActionId && slot.lastActionId.includes(options.operationKey)) {
        const status = await slot.lock.getStatus();
        centralizedLogger.debug('locks', `Повторный запрос на открытие ${deviceType} с тем же ключом (завершена)`, {
          context: { operationKey: options.operationKey, status, actionId: slot.lastActionId },
        });
        return {
          ok: true,
          deviceType,
          status,
          actionId: slot.lastActionId, // Возвращаем тот же actionId
        };
      }
    }

    // Проверка политики выдачи
    if (this.policy) {
      const canDispense = await this.policy.canDispense(deviceType, options?.context);
      if (!canDispense) {
        const reason = await this.policy.getBlockReason(deviceType, options?.context);
        centralizedLogger.warn('locks', `Выдача ${deviceType} заблокирована: ${reason}`, {
          context: options?.context,
        });
        return {
          ok: false,
          deviceType,
          status: 'locked',
          error: reason || 'policy_blocked',
        };
      }
    }

    try {
      // Отменяем предыдущий таймер, если есть
      if (slot.timer) {
        clearTimeout(slot.timer);
        slot.timer = undefined;
      }

      // Устанавливаем ключ операции
      if (options?.operationKey) {
        slot.operationInProgress = options.operationKey;
      }

      // Открываем замок
      await slot.lock.open();
      slot.lastActionAt = new Date().toISOString();
      
      // Генерируем actionId для успешной операции
      // Включаем operationKey в actionId для поддержки идемпотентности
      const actionId = options?.operationKey 
        ? `${deviceType}-${options.operationKey}-${Date.now()}`
        : `${deviceType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      slot.lastActionId = actionId;

      centralizedLogger.info('locks', `Замок ${deviceType} открыт`, {
        context: { operationKey: options?.operationKey, actionId },
      });

      // Устанавливаем таймер auto-close
      const autoCloseMs = options?.autoCloseMs ?? slot.config.autoCloseMs ?? 30000;
      slot.timer = setTimeout(() => {
        this.closeSlot(deviceType, { reason: 'auto_close' }).catch((err) => {
          centralizedLogger.error('locks', `Ошибка auto-close для ${deviceType}`, {
            error: err,
          });
        });
      }, autoCloseMs);

      const status = await slot.lock.getStatus();
      return {
        ok: true,
        deviceType,
        status,
        actionId,
      };
    } catch (error) {
      centralizedLogger.error('locks', `Ошибка открытия замка ${deviceType}`, {
        error,
        context: options?.context,
      });

      return {
        ok: false,
        deviceType,
        status: 'error',
        error: error instanceof Error ? error.message : 'open_failed',
      };
    } finally {
      // Очищаем ключ операции после завершения
      if (options?.operationKey && slot.operationInProgress === options.operationKey) {
        slot.operationInProgress = undefined;
      }
    }
  }

  /**
   * Закрывает замок (возврат устройства)
   */
  async closeSlot(
    deviceType: DeviceType,
    options?: {
      operationKey?: string;
      reason?: string;
    }
  ): Promise<LockOperationResult> {
    const slot = this.slots.get(deviceType);
    if (!slot) {
      centralizedLogger.error('locks', `Замок для ${deviceType} не найден`);
      return {
        ok: false,
        deviceType,
        status: 'error',
        error: 'lock_not_found',
      };
    }

    // Проверка idempotency
    if (options?.operationKey && slot.operationInProgress === options.operationKey) {
      const status = await slot.lock.getStatus();
      centralizedLogger.debug('locks', `Повторный запрос на закрытие ${deviceType} с тем же ключом`, {
        context: { operationKey: options.operationKey, status },
      });
      return {
        ok: status === 'locked',
        deviceType,
        status,
      };
    }

    try {
      // Отменяем таймер auto-close
      if (slot.timer) {
        clearTimeout(slot.timer);
        slot.timer = undefined;
      }

      // Устанавливаем ключ операции
      if (options?.operationKey) {
        slot.operationInProgress = options.operationKey;
      }

      // Закрываем замок
      await slot.lock.close();
      slot.lastActionAt = new Date().toISOString();

      centralizedLogger.info('locks', `Замок ${deviceType} закрыт`, {
        context: { reason: options?.reason, operationKey: options?.operationKey },
      });

      const status = await slot.lock.getStatus();
      return {
        ok: true,
        deviceType,
        status,
      };
    } catch (error) {
      centralizedLogger.error('locks', `Ошибка закрытия замка ${deviceType}`, {
        error,
      });

      return {
        ok: false,
        deviceType,
        status: 'error',
        error: error instanceof Error ? error.message : 'close_failed',
      };
    } finally {
      // Очищаем ключ операции после завершения
      if (options?.operationKey && slot.operationInProgress === options.operationKey) {
        slot.operationInProgress = undefined;
      }
    }
  }

  /**
   * Получает статус замка
   */
  async getStatus(deviceType: DeviceType): Promise<LockSnapshot | null> {
    const slot = this.slots.get(deviceType);
    if (!slot) {
      return null;
    }

    try {
      const status = await slot.lock.getStatus();
      return {
        deviceType,
        status,
        locked: status === 'locked',
        autoCloseScheduled: slot.timer !== undefined,
        lastActionAt: slot.lastActionAt,
        lastOperationKey: slot.operationInProgress || slot.lastActionId,
      };
    } catch (error) {
      return {
        deviceType,
        status: 'error',
        locked: false,
        autoCloseScheduled: false,
        lastActionAt: slot.lastActionAt,
        lastOperationKey: slot.operationInProgress || slot.lastActionId,
        error: error instanceof Error ? error.message : 'status_check_failed',
      };
    }
  }

  /**
   * Получает статусы всех замков
   */
  async getAllStatus(): Promise<Record<DeviceType, LockSnapshot | null>> {
    const result: Record<string, LockSnapshot | null> = {};
    
    const deviceTypes = Array.from(this.slots.keys());
    for (const deviceType of deviceTypes) {
      result[deviceType] = await this.getStatus(deviceType);
    }

    return result as Record<DeviceType, LockSnapshot | null>;
  }

  /**
   * Экстренное закрытие всех замков
   * Используется при shutdown или критических ошибках
   */
  async emergencyCloseAll(): Promise<{ closed: number; errors: string[] }> {
    const errors: string[] = [];
    let closed = 0;

    const entries = Array.from(this.slots.entries());
    for (const [deviceType, slot] of entries) {
      try {
        // Cancel auto-close timer
        if (slot.timer) {
          clearTimeout(slot.timer);
          slot.timer = undefined;
        }

        // Call emergency close if driver supports it
        if ('emergencyClose' in slot.lock && typeof slot.lock.emergencyClose === 'function') {
          await (slot.lock as any).emergencyClose();
        } else {
          await slot.lock.close();
        }

        closed++;
        centralizedLogger.info('locks', `Emergency closed ${deviceType}`);
      } catch (error) {
        const errorMsg = `Failed to emergency close ${deviceType}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        centralizedLogger.error('locks', errorMsg, { error });
      }
    }

    return { closed, errors };
  }

  /**
   * Очистка ресурсов
   */
  async cleanup(): Promise<void> {
    // Emergency close all locks before cleanup
    await this.emergencyCloseAll();

    const entries = Array.from(this.slots.entries());
    for (const [deviceType, slot] of entries) {
      // Закрываем Serial-порты если есть
      if (slot.lock instanceof SerialRelayLockDriver) {
        await slot.lock.disconnect().catch((err) => {
          centralizedLogger.warn('locks', `Ошибка отключения замка ${deviceType}`, {
            error: err,
          });
        });
      }
    }
  }
}
