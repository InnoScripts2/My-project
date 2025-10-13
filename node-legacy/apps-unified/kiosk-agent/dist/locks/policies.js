/**
 * Политики выдачи устройств
 */
/**
 * Базовая политика выдачи устройств согласно требованиям:
 * - Толщиномер: только после статуса оплаты 'succeeded'
 * - OBD: после выбора авто (опционально залог - вне скоупа)
 */
export class DefaultDeviceDispensePolicy {
    async canDispense(deviceType, context) {
        if (deviceType === 'thickness') {
            // Толщиномер выдаётся только после успешной оплаты
            const paymentStatus = context?.paymentStatus;
            return paymentStatus === 'succeeded';
        }
        if (deviceType === 'obd') {
            // OBD выдаётся после выбора авто
            const vehicleSelected = context?.vehicleSelected;
            return vehicleSelected === true;
        }
        return false;
    }
    async getBlockReason(deviceType, context) {
        if (deviceType === 'thickness') {
            const paymentStatus = context?.paymentStatus;
            if (!paymentStatus) {
                return 'payment_not_initiated';
            }
            if (paymentStatus !== 'succeeded') {
                return `payment_status_${paymentStatus}`;
            }
            return null;
        }
        if (deviceType === 'obd') {
            const vehicleSelected = context?.vehicleSelected;
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
export class PermissiveDeviceDispensePolicy {
    async canDispense(_deviceType, _context) {
        return true;
    }
    async getBlockReason(_deviceType, _context) {
        return null;
    }
}
