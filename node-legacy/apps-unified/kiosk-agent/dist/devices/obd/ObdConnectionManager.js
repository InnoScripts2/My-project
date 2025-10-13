/**
 * ObdConnectionManager.ts — BLE-only менеджер для KINGBOLEN Ediag Plus
 */
import { KingbolenEdiagDriver } from '@selfservice/obd-diagnostics';
export class ObdConnectionManager {
    constructor(options = {}) {
        this.snapshot = { state: 'disconnected', reconnectAttempts: 0 };
        this.snapshotListeners = new Set();
        this.autoReconnectIntervalMs = options.autoReconnectIntervalMs ?? 30000;
        this.bluetoothDiscoveryTimeoutMs = options.bluetoothDiscoveryTimeoutMs ?? 15000;
        this.logger = options.logger ?? (() => { });
        // По умолчанию фон отключён в NODE_ENV=test
        const isTestEnv = String(process.env.NODE_ENV || '').toLowerCase() === 'test';
        this.enableBackground = options.enableBackground ?? !isTestEnv;
        if (this.enableBackground) {
            this.startMonitor();
            this.scheduleReconnect(0);
        }
    }
    getSnapshot() {
        const metrics = this.driver?.getMetrics();
        return { ...this.snapshot, metrics: metrics ? { ...metrics } : undefined };
    }
    async connect(forceOrOptions) {
        const options = normalizeConnectOptions(forceOrOptions);
        if (!options.force && this.driver)
            return this.driver;
        if (this.connectionPromise)
            return this.connectionPromise;
        this.updateSnapshot({ state: 'connecting', lastError: undefined });
        this.connectionPromise = (async () => {
            try {
                const driver = new KingbolenEdiagDriver({
                    deviceName: options.deviceName ?? 'KINGBOLEN',
                    timeoutMs: options.timeoutMs ?? this.bluetoothDiscoveryTimeoutMs,
                    canFdEnabled: options.canFdEnabled ?? true,
                    autoReconnect: false, // менеджер отвечает за реконнект
                });
                await driver.connect();
                this.attachDriver(driver);
                const identity = await driver.identify();
                this.updateSnapshot({
                    state: 'connected',
                    transport: 'bluetooth',
                    identity,
                    lastConnectedAt: new Date().toISOString(),
                    lastError: undefined,
                    bluetoothName: options.deviceName ?? 'KINGBOLEN',
                    reconnectAttempts: 0,
                    metrics: driver.getMetrics(),
                });
                this.clearReconnectTimer();
                this.logger('[obd-manager] adapter connected (BLE)');
                return driver;
            }
            catch (error) {
                this.detachDriver();
                this.updateSnapshot({
                    state: 'disconnected',
                    lastError: stringifyError(error),
                    lastFailureAt: new Date().toISOString(),
                });
                this.scheduleReconnect();
                return null;
            }
            finally {
                this.connectionPromise = undefined;
            }
        })();
        return this.connectionPromise;
    }
    async disconnect() {
        if (this.connectionPromise) {
            try {
                await this.connectionPromise;
            }
            catch (e) {
                this.logger('[obd-manager] previous connect promise rejected during disconnect');
            }
        }
        const driver = this.driver;
        this.detachDriver();
        if (!driver) {
            this.updateSnapshot({ state: 'disconnected' });
            return;
        }
        try {
            await driver.disconnect();
        }
        catch (error) {
            this.logger(`[obd-manager] failed to close adapter: ${stringifyError(error)}`);
        }
        finally {
            this.updateSnapshot({ state: 'disconnected' });
        }
    }
    async withDriver(task) {
        const driver = await this.connect();
        if (!driver)
            throw new Error('OBD adapter is not connected');
        try {
            return await task(driver);
        }
        catch (error) {
            this.logger(`[obd-manager] driver task failed: ${stringifyError(error)}`);
            throw error;
        }
    }
    async ensureConnected(options) {
        if (this.snapshot.state === 'connected' && this.driver && !options?.force)
            return this.driver;
        return this.connect(options);
    }
    updateSnapshot(next) {
        const metrics = this.driver?.getMetrics();
        this.snapshot = { ...this.snapshot, ...next, metrics: metrics ?? next.metrics ?? this.snapshot.metrics };
        this.notifySnapshotListeners();
    }
    startMonitor() {
        if (this.monitorTimer)
            return;
        this.monitorTimer = setInterval(() => {
            if (this.snapshot.state !== 'connected') {
                void this.connect().catch((error) => {
                    this.logger(`[obd-manager] background connect failed: ${stringifyError(error)}`);
                });
            }
        }, this.autoReconnectIntervalMs);
        if (typeof this.monitorTimer.unref === 'function')
            this.monitorTimer.unref();
    }
    scheduleReconnect(delayMs = 5000) {
        if (!this.enableBackground)
            return;
        if (this.reconnectTimer)
            return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            if (!this.driver) {
                void this.connect().catch((error) => {
                    this.logger(`[obd-manager] reconnect attempt failed: ${stringifyError(error)}`);
                });
            }
        }, delayMs);
        if (typeof this.reconnectTimer.unref === 'function')
            this.reconnectTimer.unref();
        if (delayMs > 0) {
            this.snapshot = { ...this.snapshot, reconnectAttempts: this.snapshot.reconnectAttempts + 1 };
        }
    }
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
    }
    attachDriver(driver) {
        if (this.driver === driver)
            return;
        this.detachDriver();
        this.driver = driver;
        const onDisconnect = () => {
            this.logger('[obd-manager] adapter disconnected');
            this.detachDriver();
            this.updateSnapshot({
                state: 'disconnected',
                lastError: 'connection_lost',
                lastFailureAt: new Date().toISOString(),
            });
            this.scheduleReconnect();
        };
        const onError = (error) => {
            this.logger(`[obd-manager] driver error: ${error.message}`);
            this.updateSnapshot({ metrics: this.driver?.getMetrics() });
        };
        driver.on('disconnect', onDisconnect);
        driver.on('error', onError);
        this.driverListeners = { driver, onDisconnect, onError };
        this.updateSnapshot({ metrics: driver.getMetrics(), reconnectAttempts: 0 });
    }
    detachDriver() {
        if (!this.driverListeners) {
            this.driver = undefined;
            return;
        }
        const { driver, onDisconnect, onError } = this.driverListeners;
        driver.off?.('disconnect', onDisconnect);
        driver.off?.('error', onError);
        this.driverListeners = undefined;
        this.driver = undefined;
    }
    addSnapshotListener(listener) {
        this.snapshotListeners.add(listener);
        listener(this.getSnapshot());
        return () => {
            this.snapshotListeners.delete(listener);
        };
    }
    notifySnapshotListeners() {
        if (!this.snapshotListeners.size)
            return;
        const snapshot = this.getSnapshot();
        for (const listener of this.snapshotListeners) {
            try {
                listener(snapshot);
            }
            catch (error) {
                this.logger(`[obd-manager] snapshot listener failed: ${stringifyError(error)}`);
            }
        }
    }
}
function isTestLikeRuntime() {
    const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
    if (nodeEnv === 'test' || nodeEnv === 'testing')
        return true;
    try {
        if (Array.isArray(process.argv) && process.argv.some((a) => typeof a === 'string' && a.includes('--test'))) {
            return true;
        }
    }
    catch {
        // noop
    }
    return false;
}
export const obdConnectionManager = new ObdConnectionManager({ enableBackground: !isTestLikeRuntime() });
// В тестовой среде фоновая активность отключена внутри конструктора
function stringifyError(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === 'string')
        return error;
    return JSON.stringify(error);
}
function normalizeConnectOptions(forceOrOptions) {
    if (typeof forceOrOptions === 'boolean') {
        return { force: forceOrOptions };
    }
    return forceOrOptions ?? {};
}
// BLE-only, транспорт не выбирается
function dedupeStrings(values) {
    const filtered = values.map((v) => v?.trim()).filter((v) => !!v && v.length > 0);
    return Array.from(new Set(filtered));
}
function dedupeNumbers(values) {
    const filtered = values.filter((value) => Number.isFinite(value));
    return Array.from(new Set(filtered));
}
