import { autoDetectElm327 } from './autoDetect.js';
import { autoDetectBluetoothElm327 } from './bluetoothAutoDetect.js';
import type { Elm327Driver, Elm327DriverMetrics } from './Elm327Driver.js';

export type ObdConnectionState = 'disconnected' | 'connecting' | 'connected';
export type ObdTransport = 'serial' | 'bluetooth';

export interface ObdConnectionSnapshot {
  state: ObdConnectionState;
  transport?: ObdTransport;
  portPath?: string;
  baudRate?: number;
  identity?: string;
  lastConnectedAt?: string;
  lastError?: string;
  bluetoothAddress?: string;
  bluetoothName?: string;
  bluetoothChannel?: number;
  metrics?: Elm327DriverMetrics;
  reconnectAttempts: number;
  lastFailureAt?: string;
}

interface ObdConnectionManagerOptions {
  keepAliveIntervalMs?: number;
  autoReconnectIntervalMs?: number;
  preferBluetooth?: boolean;
  bluetoothDiscoveryTimeoutMs?: number;
  logger?: (message: string) => void;
}

export interface ObdConnectOptions {
  force?: boolean;
  transport?: ObdTransport | 'auto';
  portPath?: string;
  portHints?: string[];
  baudRate?: number;
  baudRates?: number[];
  timeoutMs?: number;
  keepAliveIntervalMs?: number;
  bluetoothAddress?: string;
  bluetoothName?: string;
  bluetoothChannel?: number;
  channelHints?: number[];
  deviceHints?: string[];
}

export class ObdConnectionManager {
  private driver?: Elm327Driver;
  private connectionPromise?: Promise<Elm327Driver | null>;
  private readonly keepAliveIntervalMs: number;
  private readonly autoReconnectIntervalMs: number;
  private readonly preferBluetooth: boolean;
  private readonly bluetoothDiscoveryTimeoutMs: number;
  private readonly logger: (message: string) => void;
  private snapshot: ObdConnectionSnapshot = { state: 'disconnected', reconnectAttempts: 0 };
  private monitorTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private driverListeners?: {
    driver: Elm327Driver;
    onDisconnect: () => void;
    onError: (error: Error) => void;
  };
  private readonly snapshotListeners = new Set<(snapshot: ObdConnectionSnapshot) => void>();
  // Журнал событий подключения (ограниченный ring buffer)
  private readonly events: ObdConnectionEvent[] = [];
  private nextEventSeq = 1;
  private readonly eventListeners = new Set<(event: ObdConnectionEvent) => void>();
  private static readonly MAX_EVENTS = 200;

  constructor(options: ObdConnectionManagerOptions = {}) {
    this.keepAliveIntervalMs = options.keepAliveIntervalMs ?? 45000;
    this.autoReconnectIntervalMs = options.autoReconnectIntervalMs ?? 30000;
    this.preferBluetooth = options.preferBluetooth ?? false;
    this.bluetoothDiscoveryTimeoutMs = options.bluetoothDiscoveryTimeoutMs ?? 15000;
    this.logger = options.logger ?? (() => {});
    this.startMonitor();
    this.scheduleReconnect(0);
  }

  /** Returns the latest connection snapshot (no side effects). */
  getSnapshot(): ObdConnectionSnapshot {
    const metrics = this.driver?.getMetrics();
    return {
      ...this.snapshot,
      metrics: metrics ? { ...metrics } : undefined,
    };
  }

  /** Ensures the adapter is connected; resolves with the driver or null if unavailable. */
  async connect(forceOrOptions?: boolean | ObdConnectOptions): Promise<Elm327Driver | null> {
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
        const attemptSerial = async (): Promise<Elm327Driver | null> => {
          const detected = await autoDetectElm327({
            portHints: portHints.length ? portHints : undefined,
            baudRates: options.baudRates ?? (options.baudRate ? [options.baudRate] : undefined),
            timeoutMs: options.timeoutMs,
            keepAliveIntervalMs: 0,
            logger: (msg: string) => this.logger(`[obd-manager] ${msg}`),
          });
          if (!detected) return null;
          if (!detected.driver) {
            this.logger('[obd-manager] autoDetectElm327 returned metadata without driver');
            return null;
          }

          this.attachDriver(detected.driver);
          this.driver!.startKeepAlive(keepAliveInterval);
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
          return this.driver!;
        };

        const attemptBluetooth = async (): Promise<Elm327Driver | null> => {
          if (!bluetoothEnabled) return null;
          const btDetected = await autoDetectBluetoothElm327({
            deviceHints: bluetoothHints.length ? bluetoothHints : undefined,
            channelHints: channelHints.length ? channelHints : undefined,
            discoveryTimeoutMs: this.bluetoothDiscoveryTimeoutMs,
            timeoutMs: options.timeoutMs,
            keepAliveIntervalMs: 0,
            logger: (msg) => this.logger(`[obd-manager] ${msg}`),
          });
          if (!btDetected) return null;
          if (!btDetected.driver) {
            this.logger('[obd-manager] bluetooth detection returned without driver instance');
            return null;
          }

          this.attachDriver(btDetected.driver);
          this.driver!.startKeepAlive(keepAliveInterval);
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
          return this.driver!;
        };

        const attempts =
          transportHint === 'bluetooth'
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
      } catch (error) {
        this.detachDriver();
        this.updateSnapshot({
          state: 'disconnected',
          lastError: stringifyError(error),
          lastFailureAt: new Date().toISOString(),
        });
        this.scheduleReconnect();
        return null;
      } finally {
        this.connectionPromise = undefined;
      }
    })();

    return this.connectionPromise;
  }

  /** Disconnects the adapter if connected. */
  async disconnect(): Promise<void> {
    if (this.connectionPromise) {
      try {
        await this.connectionPromise;
      } catch {
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
    } catch (error) {
      this.logger(`[obd-manager] failed to close adapter: ${stringifyError(error)}`);
    } finally {
      this.updateSnapshot({ state: 'disconnected' });
    }
  }

  /** Runs a callback ensuring a connected driver, propagating errors. */
  async withDriver<T>(task: (driver: Elm327Driver) => Promise<T>): Promise<T> {
    const driver = await this.connect();
    if (!driver) {
      throw new Error('OBD adapter is not connected');
    }
    try {
      return await task(driver);
    } catch (error) {
      this.logger(`[obd-manager] driver task failed: ${stringifyError(error)}`);
      throw error;
    }
  }

  /** Attempts reconnection if currently disconnected. */
  async ensureConnected(options?: ObdConnectOptions): Promise<Elm327Driver | null> {
    if (this.snapshot.state === 'connected' && this.driver && !options?.force) {
      return this.driver;
    }
    return this.connect(options);
  }

  private updateSnapshot(next: Partial<ObdConnectionSnapshot>): void {
    const metrics = this.driver?.getMetrics();
    const prev = this.snapshot;
    const merged: ObdConnectionSnapshot = {
      ...prev,
      ...next,
      metrics: metrics ?? next.metrics ?? prev.metrics,
    };
    this.snapshot = merged;
    // Запись события смены состояния
    if (prev.state !== merged.state) {
      this.pushEvent({
        kind: 'state',
        state: merged.state,
        transport: merged.transport,
        portPath: merged.portPath,
        bluetoothAddress: merged.bluetoothAddress,
        bluetoothName: merged.bluetoothName,
        bluetoothChannel: merged.bluetoothChannel,
        error: merged.lastError,
        metrics: merged.metrics ? {
          totalOperations: merged.metrics.totalOperations,
          successfulOperations: merged.metrics.successfulOperations,
          failedOperations: merged.metrics.failedOperations,
          averageResponseTimeMs: merged.metrics.averageResponseTimeMs,
          protocol: merged.metrics.protocol,
        } : undefined,
      });
    }
    // Отдельное событие ошибки (если установлена и отличается от предыдущей)
    if (merged.lastError && merged.lastError !== prev.lastError) {
      this.pushEvent({
        kind: 'error',
        state: merged.state,
        transport: merged.transport,
        portPath: merged.portPath,
        bluetoothAddress: merged.bluetoothAddress,
        bluetoothName: merged.bluetoothName,
        bluetoothChannel: merged.bluetoothChannel,
        error: merged.lastError,
      });
    }
    this.notifySnapshotListeners();
  }

  private isBluetoothEnabled(): boolean {
    const flag = process.env.OBD_BLUETOOTH?.toLowerCase().trim();
    if (flag === '0' || flag === 'false' || flag === 'off') return false;
    if (flag === '1' || flag === 'true' || flag === 'on') return true;
    if (flag === 'serial') return false;
    if (flag === 'bluetooth') return true;

    const androidIndicators = [process.env.ANDROID_ROOT, process.env.ANDROID_DATA, process.env.ANDROID_STORAGE];
    return androidIndicators.some(Boolean);
  }

  private shouldPreferBluetooth(requestedTransport?: ObdConnectOptions['transport']): boolean {
    if (requestedTransport === 'serial') return false;
    if (requestedTransport === 'bluetooth') return true;
    if (this.preferBluetooth) return true;
    const flag = process.env.OBD_BLUETOOTH?.toLowerCase().trim();
    if (flag === 'bluetooth') return true;
    return this.isBluetoothEnabled();
  }

  private startMonitor(): void {
    if (this.monitorTimer) return;
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

  private scheduleReconnect(delayMs = 5000): void {
    if (this.reconnectTimer) return;
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

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private attachDriver(driver: Elm327Driver): void {
    if (this.driver === driver) return;
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
    const onError = (error: Error) => {
      this.logger(`[obd-manager] driver error: ${error.message}`);
      // Elm327Driver может не иметь метода getMetrics в ранних версиях; безопасно игнорируем
      const metrics = (this.driver as any)?.getMetrics ? (this.driver as any).getMetrics() : undefined;
      if (metrics) this.updateSnapshot({ metrics });
    };
    driver.on('disconnect', onDisconnect);
    driver.on('error', onError);
  this.driverListeners = { driver, onDisconnect, onError };
  const initialMetrics = (driver as any)?.getMetrics ? (driver as any).getMetrics() : undefined;
  this.updateSnapshot({ metrics: initialMetrics, reconnectAttempts: 0 });
  }

  private detachDriver(): void {
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

  /** Публичная регистрация слушателя снапшотов для админ-панели. Возвращает функцию отписки. */
  addSnapshotListener(listener: (snapshot: ObdConnectionSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    try {
      listener(this.getSnapshot());
    } catch { /* ignore */ }
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }


  private notifySnapshotListeners(): void {
    if (!this.snapshotListeners.size) return;
    const snapshot = this.getSnapshot();
    for (const listener of this.snapshotListeners) {
      try {
        listener(snapshot);
      } catch (error) {
        this.logger(`[obd-manager] snapshot listener failed: ${stringifyError(error)}`);
      }
    }
  }

  /** Добавить слушателя для потока событий подключения. */
  addEventListener(listener: (event: ObdConnectionEvent) => void): () => void {
    this.eventListeners.add(listener);
    // Отправить последние события при подписке (ограничим 10 для снижения нагрузки)
    try {
      const tail = this.events.slice(-10);
      for (const ev of tail) listener(ev);
    } catch { /* ignore */ }
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /** Получить события с опциональным фильтром по ID и лимитом. */
  getEvents(opts?: { newerThanId?: string; limit?: number }): { events: ObdConnectionEvent[]; latestEventId?: string } {
    const limit = toPositiveInteger(opts?.limit) ?? ObdConnectionManager.MAX_EVENTS;
    let slice = this.events;
    if (opts?.newerThanId) {
      const idx = slice.findIndex(e => e.id === opts.newerThanId);
      if (idx >= 0) {
        slice = slice.slice(idx + 1);
      }
    }
    if (slice.length > limit) {
      slice = slice.slice(-limit);
    }
    return { events: slice, latestEventId: this.events.length ? this.events[this.events.length - 1].id : undefined };
  }

  private pushEvent(evt: Omit<ObdConnectionEvent, 'id' | 'ts'>): void {
    const full: ObdConnectionEvent = {
      ...evt,
      id: String(this.nextEventSeq++),
      ts: new Date().toISOString(),
    };
    this.events.push(full);
    if (this.events.length > ObdConnectionManager.MAX_EVENTS) {
      this.events.splice(0, this.events.length - ObdConnectionManager.MAX_EVENTS);
    }
    // Оповестить слушателей
    if (this.eventListeners.size) {
      for (const l of this.eventListeners) {
        try { l(full); } catch (err) { this.logger(`[obd-manager] event listener failed: ${stringifyError(err)}`); }
      }
    }
  }

  /** Последний ID события */
  getLatestEventId(): string | undefined {
    return this.events.length ? this.events[this.events.length - 1].id : undefined;
  }
}

export const obdConnectionManager = new ObdConnectionManager();

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error);
}

function normalizeConnectOptions(forceOrOptions?: boolean | ObdConnectOptions): ObdConnectOptions {
  if (typeof forceOrOptions === 'boolean') {
    return { force: forceOrOptions };
  }
  return forceOrOptions ?? {};
}

function toPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

// Событие истории подключения
export interface ObdConnectionEvent {
  id: string;
  ts: string;
  kind: 'state' | 'error';
  state?: ObdConnectionState;
  transport?: ObdTransport;
  portPath?: string;
  bluetoothAddress?: string;
  bluetoothName?: string;
  bluetoothChannel?: number;
  error?: string;
  metrics?: {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageResponseTimeMs: number;
    protocol?: string | null;
  };
}

function resolveTransportHint(
  requested: ObdConnectOptions['transport'],
  preferBluetooth: boolean
): ObdTransport | undefined {
  if (requested === 'serial' || requested === 'bluetooth') return requested;
  if (requested === 'auto') return undefined;
  return preferBluetooth ? 'bluetooth' : undefined;
}

function dedupeStrings(values: string[]): string[] {
  const filtered = values.map((v) => v?.trim()).filter((v): v is string => !!v && v.length > 0);
  return Array.from(new Set(filtered));
}

function dedupeNumbers(values: number[]): number[] {
  const filtered = values.filter((value) => Number.isFinite(value));
  return Array.from(new Set(filtered));
}
