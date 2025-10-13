import { autoDetectElm327 } from './autoDetect.js';
import { autoDetectBluetoothElm327 } from './bluetoothAutoDetect.js';
export class ObdConnectionManager {
    driver;
    connectionPromise;
    keepAliveIntervalMs;
    autoReconnectIntervalMs;
    preferBluetooth;
    bluetoothDiscoveryTimeoutMs;
    logger;
    snapshot = { state: 'disconnected', reconnectAttempts: 0 };
    monitorTimer;
    reconnectTimer;
    driverListeners;
    snapshotListeners = new Set();
    constructor(options = {}) {
        this.keepAliveIntervalMs = options.keepAliveIntervalMs ?? 45000;
        this.autoReconnectIntervalMs = options.autoReconnectIntervalMs ?? 30000;
        this.preferBluetooth = options.preferBluetooth ?? false;
        this.bluetoothDiscoveryTimeoutMs = options.bluetoothDiscoveryTimeoutMs ?? 15000;
        this.logger = options.logger ?? (() => { });
        this.startMonitor();
        this.scheduleReconnect(0);
    }
    /** Returns the latest connection snapshot (no side effects). */
    getSnapshot() {
        const metrics = this.driver?.getMetrics();
        return {
            ...this.snapshot,
            metrics: metrics ? { ...metrics } : undefined,
        };
    }
    /** Ensures the adapter is connected; resolves with the driver or null if unavailable. */
    async connect(forceOrOptions) {
        const options = normalizeConnectOptions(forceOrOptions);
        if (!options.force && this.driver) {
            return this.driver;
        }
        if (this.connectionPromise) {
            return this.connectionPromise;
        }
        this.updateSnapshot({ state: 'connecting', lastError: undefined });
        const previousSerialHints = this.snapshot.transport === 'serial' && this.snapshot.portPath ? [this.snapshot.portPath] : [];
        const previousBluetoothHints = this.snapshot.transport === 'bluetooth'
            ? [this.snapshot.bluetoothAddress ?? '', this.snapshot.bluetoothName ?? ''].filter(Boolean)
            : [];
        const bluetoothEnabled = this.isBluetoothEnabled();
        const preferBluetooth = this.shouldPreferBluetooth(options.transport);
        const transportHint = resolveTransportHint(options.transport, preferBluetooth);
        const portHints = dedupeStrings([
            ...previousSerialHints,
            ...(options.portPath ? [options.portPath] : []),
            ...(options.portHints ?? []),
        ]);
        const bluetoothHints = dedupeStrings([
            ...previousBluetoothHints,
            ...(options.bluetoothAddress ? [options.bluetoothAddress] : []),
            ...(options.bluetoothName ? [options.bluetoothName] : []),
            ...(options.deviceHints ?? []),
        ]);
        const channelHints = dedupeNumbers([
            ...(options.channelHints ?? []),
            ...(options.bluetoothChannel != null ? [options.bluetoothChannel] : []),
            ...(this.snapshot.bluetoothChannel != null ? [this.snapshot.bluetoothChannel] : []),
        ]);
        const keepAliveInterval = options.keepAliveIntervalMs ?? this.keepAliveIntervalMs;
        this.connectionPromise = (async () => {
            try {
                const attemptSerial = async () => {
                    const detected = await autoDetectElm327({
                        portHints: portHints.length ? portHints : undefined,
                        baudRates: options.baudRates ?? (options.baudRate ? [options.baudRate] : undefined),
                        timeoutMs: options.timeoutMs,
                        keepAliveIntervalMs: 0,
                        logger: (msg) => this.logger(`[obd-manager] ${msg}`),
                    });
                    if (!detected)
                        return null;
                    this.attachDriver(detected.driver);
                    this.driver.startKeepAlive(keepAliveInterval);
                    this.updateSnapshot({
                        state: 'connected',
                        transport: 'serial',
                        portPath: detected.portPath,
                        baudRate: detected.baudRate,
                        identity: detected.identity,
                        lastConnectedAt: new Date().toISOString(),
                        lastError: undefined,
                        bluetoothAddress: undefined,
                        bluetoothName: undefined,
                        bluetoothChannel: undefined,
                        reconnectAttempts: 0,
                        metrics: this.driver?.getMetrics(),
                    });
                    return this.driver;
                };
                const attemptBluetooth = async () => {
                    if (!bluetoothEnabled)
                        return null;
                    const btDetected = await autoDetectBluetoothElm327({
                        deviceHints: bluetoothHints.length ? bluetoothHints : undefined,
                        channelHints: channelHints.length ? channelHints : undefined,
                        discoveryTimeoutMs: this.bluetoothDiscoveryTimeoutMs,
                        timeoutMs: options.timeoutMs,
                        keepAliveIntervalMs: 0,
                        logger: (msg) => this.logger(`[obd-manager] ${msg}`),
                    });
                    if (!btDetected)
                        return null;
                    this.attachDriver(btDetected.driver);
                    this.driver.startKeepAlive(keepAliveInterval);
                    this.updateSnapshot({
                        state: 'connected',
                        transport: 'bluetooth',
                        portPath: undefined,
                        baudRate: undefined,
                        identity: btDetected.identity,
                        lastConnectedAt: new Date().toISOString(),
                        lastError: undefined,
                        bluetoothAddress: btDetected.address,
                        bluetoothName: btDetected.name,
                        bluetoothChannel: btDetected.channel >= 0 ? btDetected.channel : undefined,
                        reconnectAttempts: 0,
                        metrics: this.driver?.getMetrics(),
                    });
                    return this.driver;
                };
                const attempts = transportHint === 'bluetooth'
                    ? [attemptBluetooth, attemptSerial]
                    : transportHint === 'serial'
                        ? [attemptSerial, attemptBluetooth]
                        : preferBluetooth
                            ? [attemptBluetooth, attemptSerial]
                            : [attemptSerial, attemptBluetooth];
                for (const attempt of attempts) {
                    const result = await attempt();
                    if (result) {
                        this.logger('[obd-manager] adapter connected');
                        this.clearReconnectTimer();
                        return result;
                    }
                }
                this.detachDriver();
                this.updateSnapshot({
                    state: 'disconnected',
                    lastError: 'adapter_not_found',
                    lastFailureAt: new Date().toISOString(),
                });
                this.scheduleReconnect();
                return null;
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
    /** Disconnects the adapter if connected. */
    async disconnect() {
        if (this.connectionPromise) {
            try {
                await this.connectionPromise;
            }
            catch {
                // ignore
            }
        }
        const driver = this.driver;
        this.detachDriver();
        if (!driver) {
            this.updateSnapshot({ state: 'disconnected' });
            return;
        }
        try {
            await driver.close();
        }
        catch (error) {
            this.logger(`[obd-manager] failed to close adapter: ${stringifyError(error)}`);
        }
        finally {
            this.updateSnapshot({ state: 'disconnected' });
        }
    }
    /** Runs a callback ensuring a connected driver, propagating errors. */
    async withDriver(task) {
        const driver = await this.connect();
        if (!driver) {
            throw new Error('OBD adapter is not connected');
        }
        try {
            return await task(driver);
        }
        catch (error) {
            this.logger(`[obd-manager] driver task failed: ${stringifyError(error)}`);
            throw error;
        }
    }
    /** Attempts reconnection if currently disconnected. */
    async ensureConnected(options) {
        if (this.snapshot.state === 'connected' && this.driver && !options?.force) {
            return this.driver;
        }
        return this.connect(options);
    }
    updateSnapshot(next) {
        const metrics = this.driver?.getMetrics();
        this.snapshot = {
            ...this.snapshot,
            ...next,
            metrics: metrics ?? next.metrics ?? this.snapshot.metrics,
        };
        this.notifySnapshotListeners();
    }
    isBluetoothEnabled() {
        const flag = process.env.OBD_BLUETOOTH?.toLowerCase().trim();
        if (flag === '0' || flag === 'false' || flag === 'off')
            return false;
        if (flag === '1' || flag === 'true' || flag === 'on')
            return true;
        if (flag === 'serial')
            return false;
        if (flag === 'bluetooth')
            return true;
        const androidIndicators = [process.env.ANDROID_ROOT, process.env.ANDROID_DATA, process.env.ANDROID_STORAGE];
        return androidIndicators.some(Boolean);
    }
    shouldPreferBluetooth(requestedTransport) {
        if (requestedTransport === 'serial')
            return false;
        if (requestedTransport === 'bluetooth')
            return true;
        if (this.preferBluetooth)
            return true;
        const flag = process.env.OBD_BLUETOOTH?.toLowerCase().trim();
        if (flag === 'bluetooth')
            return true;
        return this.isBluetoothEnabled();
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
        if (typeof this.monitorTimer.unref === 'function') {
            this.monitorTimer.unref();
        }
    }
    scheduleReconnect(delayMs = 5000) {
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
        if (typeof this.reconnectTimer.unref === 'function') {
            this.reconnectTimer.unref();
        }
        if (delayMs > 0) {
            this.snapshot = {
                ...this.snapshot,
                reconnectAttempts: this.snapshot.reconnectAttempts + 1,
            };
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
        driver.off('disconnect', onDisconnect);
        driver.off('error', onError);
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
export const obdConnectionManager = new ObdConnectionManager();
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
function resolveTransportHint(requested, preferBluetooth) {
    if (requested === 'serial' || requested === 'bluetooth')
        return requested;
    if (requested === 'auto')
        return undefined;
    return preferBluetooth ? 'bluetooth' : undefined;
}
function dedupeStrings(values) {
    const filtered = values.map((v) => v?.trim()).filter((v) => !!v && v.length > 0);
    return Array.from(new Set(filtered));
}
function dedupeNumbers(values) {
    const filtered = values.filter((value) => Number.isFinite(value));
    return Array.from(new Set(filtered));
}
