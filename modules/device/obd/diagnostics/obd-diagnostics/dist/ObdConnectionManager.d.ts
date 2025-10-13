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
    enableBackground?: boolean;
}
export interface ObdConnectOptions {
    force?: boolean;
    timeoutMs?: number;
    deviceName?: string;
    canFdEnabled?: boolean;
}
export declare class ObdConnectionManager {
    private driver?;
    private connectionPromise?;
    private readonly autoReconnectIntervalMs;
    private readonly bluetoothDiscoveryTimeoutMs;
    private readonly logger;
    private readonly enableBackground;
    private snapshot;
    private monitorTimer?;
    private reconnectTimer?;
    private driverListeners?;
    private readonly snapshotListeners;
    constructor(options?: ObdConnectionManagerOptions);
    getSnapshot(): ObdConnectionSnapshot;
    connect(forceOrOptions?: boolean | ObdConnectOptions): Promise<KingbolenEdiagDriver | null>;
    disconnect(): Promise<void>;
    withDriver<T>(task: (driver: KingbolenEdiagDriver) => Promise<T>): Promise<T>;
    ensureConnected(options?: ObdConnectOptions): Promise<KingbolenEdiagDriver | null>;
    private updateSnapshot;
    private startMonitor;
    private scheduleReconnect;
    private clearReconnectTimer;
    private attachDriver;
    private detachDriver;
    addSnapshotListener(listener: (snapshot: ObdConnectionSnapshot) => void): () => void;
    private notifySnapshotListeners;
}
export declare const obdConnectionManager: ObdConnectionManager;
export {};
