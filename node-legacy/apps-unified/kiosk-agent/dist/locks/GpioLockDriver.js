/**
 * Драйвер для управления замком через GPIO (например, Raspberry Pi)
 *
 * Features:
 * - Auto-close timeout (safety)
 * - Emergency close support
 * - Prometheus metrics
 * - Simulated GPIO in non-Pi environments
 */
import { Gauge } from 'prom-client';
import { lockOperations, lockAutoClose, lockEmergencyClose, lockOpenDuration, } from './metrics.js';
// GPIO-specific metrics
const lockState = new Gauge({
    name: 'lock_state_gpio',
    help: 'Lock state (0=locked, 1=unlocked, 2=error)',
    labelNames: ['device', 'state']
});
/**
 * GPIO-драйвер с поддержкой безопасности
 * В продакшене может использовать библиотеку onoff или pigpio
 */
export class GpioLockDriver {
    constructor(config, deviceName = 'unknown') {
        this.currentStatus = 'locked';
        this.config = {
            activeHigh: true,
            autoCloseTimeoutMs: 30000,
            ...config,
        };
        this.deviceName = deviceName;
        this.updateStateMetric();
    }
    updateStateMetric() {
        lockState.labels(this.deviceName, 'locked').set(this.currentStatus === 'locked' ? 1 : 0);
        lockState.labels(this.deviceName, 'unlocked').set(this.currentStatus === 'unlocked' ? 1 : 0);
        lockState.labels(this.deviceName, 'error').set(this.currentStatus === 'error' ? 1 : 0);
    }
    async open() {
        try {
            // В реальной реализации здесь будет управление GPIO
            // Например: await this.gpio.write(this.config.activeHigh ? 1 : 0);
            await this.simulateGpioWrite(this.config.activeHigh ? 1 : 0);
            this.currentStatus = 'unlocked';
            this.openedAt = Date.now();
            this.updateStateMetric();
            lockOperations.labels(this.deviceName, 'open', 'success').inc();
            // Setup auto-close timer
            if (this.config.autoCloseTimeoutMs) {
                this.autoCloseTimer = setTimeout(() => {
                    this.autoClose().catch((error) => {
                        console.error(`[GpioLockDriver] Auto-close failed for ${this.deviceName}:`, error);
                    });
                }, this.config.autoCloseTimeoutMs);
            }
        }
        catch (error) {
            this.currentStatus = 'error';
            this.updateStateMetric();
            lockOperations.labels(this.deviceName, 'open', 'error').inc();
            throw new Error(`GPIO open failed on pin ${this.config.pin}: ${error}`);
        }
    }
    async close() {
        try {
            // Cancel auto-close timer
            if (this.autoCloseTimer) {
                clearTimeout(this.autoCloseTimer);
                this.autoCloseTimer = undefined;
            }
            // Track open duration
            if (this.openedAt) {
                const durationSeconds = (Date.now() - this.openedAt) / 1000;
                lockOpenDuration.labels(this.deviceName).inc(durationSeconds);
                this.openedAt = undefined;
            }
            // В реальной реализации здесь будет управление GPIO
            // Например: await this.gpio.write(this.config.activeHigh ? 0 : 1);
            await this.simulateGpioWrite(this.config.activeHigh ? 0 : 1);
            this.currentStatus = 'locked';
            this.updateStateMetric();
            lockOperations.labels(this.deviceName, 'close', 'success').inc();
        }
        catch (error) {
            this.currentStatus = 'error';
            this.updateStateMetric();
            lockOperations.labels(this.deviceName, 'close', 'error').inc();
            throw new Error(`GPIO close failed on pin ${this.config.pin}: ${error}`);
        }
    }
    async autoClose() {
        console.warn(`[GpioLockDriver] Auto-closing ${this.deviceName} after timeout`);
        lockAutoClose.labels(this.deviceName).inc();
        await this.close();
    }
    async emergencyClose() {
        console.error(`[GpioLockDriver] Emergency close for ${this.deviceName}`);
        lockEmergencyClose.inc();
        try {
            await this.close();
        }
        catch (error) {
            console.error(`[GpioLockDriver] Emergency close failed for ${this.deviceName}:`, error);
            throw error;
        }
    }
    async getStatus() {
        return this.currentStatus;
    }
    /**
     * Заглушка для GPIO записи
     * В реальной реализации заменить на библиотеку GPIO (onoff, pigpio)
     */
    async simulateGpioWrite(_value) {
        // Для совместимости в среде без GPIO
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}
