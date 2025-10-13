/**
 * Драйвер для управления замком через USB-Serial реле
 *
 * Features:
 * - Auto-close timeout (safety)
 * - Heartbeat monitoring
 * - Emergency close support
 * - Prometheus metrics
 */
import { SerialPort } from 'serialport';
import { Gauge } from 'prom-client';
import { lockOperations, lockAutoClose, lockEmergencyClose, lockOpenDuration, } from './metrics.js';
// Serial-specific metrics
const lockState = new Gauge({
    name: 'lock_state_serial',
    help: 'Lock state (0=locked, 1=unlocked, 2=error)',
    labelNames: ['device', 'state']
});
export class SerialRelayLockDriver {
    constructor(config, deviceName = 'unknown') {
        this.currentStatus = 'locked';
        this.config = {
            baudRate: 9600,
            relayChannel: 1,
            autoCloseTimeoutMs: 30000,
            heartbeatIntervalMs: 5000,
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
    startHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        if (!this.config.heartbeatIntervalMs) {
            return;
        }
        this.heartbeatTimer = setInterval(() => {
            this.checkConnection().catch((error) => {
                console.error(`[SerialRelayLockDriver] Heartbeat failed for ${this.deviceName}:`, error);
                this.currentStatus = 'error';
                this.updateStateMetric();
            });
        }, this.config.heartbeatIntervalMs);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
    }
    async checkConnection() {
        if (!this.serialPort?.isOpen) {
            throw new Error('Serial port is not open');
        }
    }
    ensureConnection() {
        if (this.serialPort?.isOpen) {
            return Promise.resolve();
        }
        this.serialPort = new SerialPort({
            path: this.config.port,
            baudRate: this.config.baudRate,
            autoOpen: false,
        });
        return new Promise((resolve, reject) => {
            this.serialPort.open((err) => {
                if (err) {
                    this.currentStatus = 'error';
                    this.updateStateMetric();
                    lockOperations.labels(this.deviceName, 'connect', 'error').inc();
                    reject(new Error(`Failed to open serial port ${this.config.port}: ${err.message}`));
                }
                else {
                    lockOperations.labels(this.deviceName, 'connect', 'success').inc();
                    this.startHeartbeat();
                    resolve();
                }
            });
        });
    }
    async open() {
        try {
            await this.ensureConnection();
            const command = this.config.openCommand ?? this.buildRelayCommand(this.config.relayChannel, 0x01);
            await this.sendCommand(command);
            this.currentStatus = 'unlocked';
            this.openedAt = Date.now();
            this.updateStateMetric();
            lockOperations.labels(this.deviceName, 'open', 'success').inc();
            // Setup auto-close timer
            if (this.config.autoCloseTimeoutMs) {
                this.autoCloseTimer = setTimeout(() => {
                    this.autoClose().catch((error) => {
                        console.error(`[SerialRelayLockDriver] Auto-close failed for ${this.deviceName}:`, error);
                    });
                }, this.config.autoCloseTimeoutMs);
            }
        }
        catch (error) {
            this.currentStatus = 'error';
            this.updateStateMetric();
            lockOperations.labels(this.deviceName, 'open', 'error').inc();
            throw error;
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
            await this.ensureConnection();
            const command = this.config.closeCommand ?? this.buildRelayCommand(this.config.relayChannel, 0x00);
            await this.sendCommand(command);
            this.currentStatus = 'locked';
            this.updateStateMetric();
            lockOperations.labels(this.deviceName, 'close', 'success').inc();
        }
        catch (error) {
            this.currentStatus = 'error';
            this.updateStateMetric();
            lockOperations.labels(this.deviceName, 'close', 'error').inc();
            throw error;
        }
    }
    async autoClose() {
        console.warn(`[SerialRelayLockDriver] Auto-closing ${this.deviceName} after timeout`);
        lockAutoClose.labels(this.deviceName).inc();
        await this.close();
    }
    async emergencyClose() {
        console.error(`[SerialRelayLockDriver] Emergency close for ${this.deviceName}`);
        lockEmergencyClose.inc();
        try {
            await this.close();
        }
        catch (error) {
            console.error(`[SerialRelayLockDriver] Emergency close failed for ${this.deviceName}:`, error);
            throw error;
        }
    }
    async getStatus() {
        if (!this.serialPort?.isOpen) {
            return 'unknown';
        }
        return this.currentStatus;
    }
    async disconnect() {
        this.stopHeartbeat();
        if (this.autoCloseTimer) {
            clearTimeout(this.autoCloseTimer);
            this.autoCloseTimer = undefined;
        }
        if (this.serialPort?.isOpen) {
            return new Promise((resolve) => {
                this.serialPort.close(() => {
                    resolve();
                });
            });
        }
    }
    async sendCommand(command) {
        if (!this.serialPort?.isOpen) {
            throw new Error('Serial port is not open');
        }
        return new Promise((resolve, reject) => {
            this.serialPort.write(command, (err) => {
                if (err) {
                    reject(new Error(`Failed to send command: ${err.message}`));
                }
                else {
                    // Небольшая задержка для обработки команды реле
                    setTimeout(resolve, 100);
                }
            });
        });
    }
    /**
     * Строит команду для типичного USB-реле (например, на чипе CH340)
     * Формат: [0xA0, channel, state, checksum]
     * Checksum: (0xA0 + channel + state) & 0xFF
     */
    buildRelayCommand(channel, state) {
        const checksum = (0xA0 + channel + state) & 0xFF;
        return Buffer.from([0xA0, channel, state, checksum]);
    }
}
