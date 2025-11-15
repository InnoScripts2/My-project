/**
 * Политики выдачи устройств
 */

import type { DeviceType, DeviceDispensePolicy } from './types.js';

/**
 * Базовая политика выдачи устройств согласно требованиям:
 * - Толщиномер: только после статуса оплаты 'succeeded'
 * - OBD: после выбора авто (опционально залог - вне скоупа)
 */
export class DefaultDeviceDispensePolicy implements DeviceDispensePolicy {
  async canDispense(deviceType: DeviceType, context?: Record<string, unknown>): Promise<boolean> {
    if (deviceType === 'thickness') {
      // Толщиномер выдаётся только после успешной оплаты
      const paymentStatus = context?.paymentStatus as string | undefined;
      return paymentStatus === 'succeeded';
    }

    if (deviceType === 'obd') {
      // OBD выдаётся после выбора авто
      const vehicleSelected = context?.vehicleSelected as boolean | undefined;
      return vehicleSelected === true;
    }

    return false;
  }

  async getBlockReason(deviceType: DeviceType, context?: Record<string, unknown>): Promise<string | null> {
    if (deviceType === 'thickness') {
      const paymentStatus = context?.paymentStatus as string | undefined;
      if (!paymentStatus) {
        return 'payment_not_initiated';
      }
      if (paymentStatus !== 'succeeded') {
        return `payment_status_${paymentStatus}`;
      }
      return null;
    }

    if (deviceType === 'obd') {
      const vehicleSelected = context?.vehicleSelected as boolean | undefined;
      if (!vehicleSelected) {
        return 'vehicle_not_selected';
      }
      return null;
    }

    return 'unknown_device_type';
  }
}

/**
 * Пермиссивная политика для DEV-режима (разрешает всё)
 */
export class PermissiveDeviceDispensePolicy implements DeviceDispensePolicy {
  async canDispense(_deviceType: DeviceType, _context?: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  async getBlockReason(_deviceType: DeviceType, _context?: Record<string, unknown>): Promise<string | null> {
    return null;
  }
}
