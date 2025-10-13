/**
 * ObdConnectionManager.ts — BLE-only менеджер для KINGBOLEN Ediag Plus
 */

import { KingbolenEdiagDriver, type KingbolenEdiagMetrics } from './KingbolenEdiagDriver.js';

export type ObdConnectionState = 'disconnected' | 'connecting' | 'connected';
export type ObdTransport = 'bluetooth';

export interface ObdConnectionSnapshot {
  state: ObdConnectionState;
  transport?: ObdTransport;
  identity?: string;
  lastConnectedAt?: string;
  lastError?: string;
  bluetoothName?: string;
  metrics?: KingbolenEdiagMetrics;
  reconnectAttempts: number;
  lastFailureAt?: string;
}

interface ObdConnectionManagerOptions {
  autoReconnectIntervalMs?: number;
  bluetoothDiscoveryTimeoutMs?: number;
  logger?: (message: string) => void;
  deviceName?: string;
  canFdEnabled?: boolean;
  enableBackground?: boolean; // отключает фоновые таймеры/автоподключение (полезно для тестов)
}

export interface ObdConnectOptions {
  force?: boolean;
  timeoutMs?: number;
  deviceName?: string;
  canFdEnabled?: boolean;
}

export class ObdConnectionManager {
  private driver?: KingbolenEdiagDriver;
  private connectionPromise?: Promise<KingbolenEdiagDriver | null>;
  private readonly autoReconnectIntervalMs: number;
  private readonly bluetoothDiscoveryTimeoutMs: number;
  private readonly logger: (message: string) => void;
  private readonly enableBackground: boolean;
  private snapshot: ObdConnectionSnapshot = { state: 'disconnected', reconnectAttempts: 0 };
  private monitorTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private driverListeners?: {
    driver: KingbolenEdiagDriver;
    onDisconnect: () => void;
    onError: (error: Error) => void;
  };
  private readonly snapshotListeners = new Set<(snapshot: ObdConnectionSnapshot) => void>();

  constructor(options: ObdConnectionManagerOptions = {}) {
    this.autoReconnectIntervalMs = options.autoReconnectIntervalMs ?? 30000;
    this.bluetoothDiscoveryTimeoutMs = options.bluetoothDiscoveryTimeoutMs ?? 15000;
    this.logger = options.logger ?? (() => {});
    // По умолчанию фон отключён в NODE_ENV=test
    const isTestEnv = String(process.env.NODE_ENV || '').toLowerCase() === 'test';
    this.enableBackground = options.enableBackground ?? !isTestEnv;
    if (this.enableBackground) {
      this.startMonitor();
      this.scheduleReconnect(0);
    }
  }

  getSnapshot(): ObdConnectionSnapshot {
    const metrics = this.driver?.getMetrics();
    return { ...this.snapshot, metrics: metrics ? { ...metrics } : undefined };
  }

  async connect(forceOrOptions?: boolean | ObdConnectOptions): Promise<KingbolenEdiagDriver | null> {
    const options = normalizeConnectOptions(forceOrOptions);
    if (!options.force && this.driver) return this.driver;
    if (this.connectionPromise) return this.connectionPromise;

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

  async disconnect(): Promise<void> {
    if (this.connectionPromise) {
      try {
        await this.connectionPromise;
      } catch (e) {
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
    } catch (error) {
      this.logger(`[obd-manager] failed to close adapter: ${stringifyError(error)}`);
    } finally {
      this.updateSnapshot({ state: 'disconnected' });
    }
  }

  async withDriver<T>(task: (driver: KingbolenEdiagDriver) => Promise<T>): Promise<T> {
    const driver = await this.connect();
    if (!driver) throw new Error('OBD adapter is not connected');
    try {
      return await task(driver);
    } catch (error) {
      this.logger(`[obd-manager] driver task failed: ${stringifyError(error)}`);
      throw error;
    }
  }

  async ensureConnected(options?: ObdConnectOptions): Promise<KingbolenEdiagDriver | null> {
    if (this.snapshot.state === 'connected' && this.driver && !options?.force) return this.driver;
    return this.connect(options);
  }

  private updateSnapshot(next: Partial<ObdConnectionSnapshot>): void {
    const metrics = this.driver?.getMetrics();
    this.snapshot = { ...this.snapshot, ...next, metrics: metrics ?? next.metrics ?? this.snapshot.metrics };
    this.notifySnapshotListeners();
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
    if (typeof this.monitorTimer.unref === 'function') this.monitorTimer.unref();
  }

  private scheduleReconnect(delayMs = 5000): void {
    if (!this.enableBackground) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.driver) {
        void this.connect().catch((error) => {
          this.logger(`[obd-manager] reconnect attempt failed: ${stringifyError(error)}`);
        });
      }
    }, delayMs);
    if (typeof this.reconnectTimer.unref === 'function') this.reconnectTimer.unref();
    if (delayMs > 0) {
      this.snapshot = { ...this.snapshot, reconnectAttempts: this.snapshot.reconnectAttempts + 1 };
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private attachDriver(driver: KingbolenEdiagDriver): void {
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
      this.updateSnapshot({ metrics: this.driver?.getMetrics() });
    };
    driver.on('disconnect', onDisconnect);
    driver.on('error', onError as any);
    this.driverListeners = { driver, onDisconnect, onError };
    this.updateSnapshot({ metrics: driver.getMetrics(), reconnectAttempts: 0 });
  }

  private detachDriver(): void {
    if (!this.driverListeners) {
      this.driver = undefined;
      return;
    }
    const { driver, onDisconnect, onError } = this.driverListeners;
    (driver as any).off?.('disconnect', onDisconnect);
    (driver as any).off?.('error', onError);
    this.driverListeners = undefined;
    this.driver = undefined;
  }

  addSnapshotListener(listener: (snapshot: ObdConnectionSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    listener(this.getSnapshot());
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
}

function isTestLikeRuntime(): boolean {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  if (nodeEnv === 'test' || nodeEnv === 'testing') return true;
  try {
    if (Array.isArray(process.argv) && process.argv.some((a) => typeof a === 'string' && a.includes('--test'))) {
      return true;
    }
  } catch {
    // noop
  }
  return false;
}

export const obdConnectionManager = new ObdConnectionManager({ enableBackground: !isTestLikeRuntime() });
// В тестовой среде фоновая активность отключена внутри конструктора

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

// BLE-only, транспорт не выбирается

function dedupeStrings(values: string[]): string[] {
  const filtered = values.map((v) => v?.trim()).filter((v): v is string => !!v && v.length > 0);
  return Array.from(new Set(filtered));
}

function dedupeNumbers(values: number[]): number[] {
  const filtered = values.filter((value) => Number.isFinite(value));
  return Array.from(new Set(filtered));
}
