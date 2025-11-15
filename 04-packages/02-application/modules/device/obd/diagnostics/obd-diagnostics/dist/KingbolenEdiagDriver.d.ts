import { EventEmitter } from 'events';
import { DtcSeverity } from './dtcDescriptions.js';
import type { ObdMode, PidIdentifier, DtcCode } from './database/types.js';
export interface ObdDtc {
    code: string;
    description?: string;
    status?: 'current' | 'pending' | 'permanent';
    severity?: DtcSeverity;
}
export interface ObdResult<T> {
    ok: boolean;
    data?: T;
    error?: string;
}
export interface ObdStatus {
    mil: boolean;
    dtcCount: number;
    readiness: Record<string, boolean>;
}
export interface ObdLiveData {
    rpm: number;
    coolantTemp: number;
    intakeTemp: number;
    speed: number;
    voltage: number;
    throttle: number;
}
export interface ToyotaHybridData {
    battery_soc: number;
    mg1_rpm: number;
    mg2_rpm: number;
    trans_temp: number;
    gear_position: string;
    egr_position: number;
    catalyst_temp: number;
}
export interface KingbolenEdiagOptions {
    deviceName?: string;
    /** MAC/UUID адрес BLE-устройства (если известен). Даёт точное сопоставление при поиске. */
    deviceAddress?: string;
    serviceUUID?: string;
    txCharacteristicUUID?: string;
    rxCharacteristicUUID?: string;
    timeoutMs?: number;
    autoReconnect?: boolean;
    canFdEnabled?: boolean;
}
export interface KingbolenEdiagMetrics {
    totalCommands: number;
    successfulCommands: number;
    failedCommands: number;
    timeouts: number;
    averageLatencyMs: number;
    averageSuccessLatencyMs?: number;
    averageErrorLatencyMs?: number;
    lastCommand: string;
    lastDurationMs: number;
    lastError?: string;
    lastUpdatedAt: string;
    protocolUsed?: string;
    firmwareVersion?: string;
    connectionAttempts?: number;
    lastConnectPhase?: 'initial' | 'widened';
    bytesSent?: number;
    bytesReceived?: number;
    connectStartedAt?: string;
    connectedAt?: string;
    lastRssi?: number;
    reconnectAttempts?: number;
    reconnectSuccesses?: number;
    reconnectFailures?: number;
    lastDisconnectAt?: string;
    lastReconnectScheduledAt?: string;
    lastReconnectAttemptAt?: string;
    queueDepth?: number;
    maxQueueDepthObserved?: number;
    lastQueueDepthChangeAt?: string;
    lastReconnectDurationSeconds?: number;
    totalReconnectDurationSeconds?: number;
    watchdogTriggers?: number;
    lastReconnectAt?: string;
    lastWatchdogTriggerAt?: string;
    lastCommandCompletedAt?: string;
    secondsSinceLastCommandCompleted?: number;
}
export declare class KingbolenEdiagDriver extends EventEmitter {
    private peripheral;
    private txCharacteristic;
    private rxCharacteristic;
    private connected;
    private options;
    private nobleStateChangeHandler?;
    private nobleDiscoverHandler?;
    private rxDataHandler?;
    private peripheralDisconnectHandler?;
    private commandQueue;
    private responseBuffer;
    private pendingResponse?;
    private metrics;
    private latencySuccessAccumMs;
    private latencyErrorAccumMs;
    private isActiveReconnectAttempt;
    private lastReconnectStartTs;
    private watchdogTimer;
    private readonly watchdogIntervalMs;
    constructor(options?: KingbolenEdiagOptions);
    connect(abortSignal?: AbortSignal, isReconnect?: boolean): Promise<boolean>;
    private computeScanServices;
    private shortUuid;
    private connectToPeripheral;
    private initialize;
    sendCommand(command: string, timeoutMs?: number): Promise<string>;
    private processNextCommand;
    private handleData;
    private handleClosed;
    private handleError;
    readDTC(): Promise<ObdResult<ObdDtc[]>>;
    clearDTC(): Promise<ObdResult<boolean>>;
    readStatus(): Promise<ObdResult<ObdStatus>>;
    readLiveData(): Promise<ObdResult<ObdLiveData>>;
    readToyotaHybrid(): Promise<ObdResult<ToyotaHybridData>>;
    readPID(pid: string): Promise<string>;
    private decodePID;
    private parseDTC;
    private parseHexResponse;
    identify(): Promise<string>;
    readVoltage(): Promise<ObdResult<number>>;
    disconnect(): Promise<void>;
    close(): Promise<void>;
    /** Соединение активно? */
    isConnected(): boolean;
    getMetrics(): KingbolenEdiagMetrics;
    /**
     * Совместимость с обобщённым интерфейсом ObdDriver: запрос PID
     * @param mode OBD mode, например '01'
     * @param pid Двухсимвольный HEX PID, например '0C'
     */
    requestPid(mode: ObdMode, pid: PidIdentifier): Promise<string>;
    /**
     * Совместимость: запрос DTC-кодов с типизацией DtcCode
     */
    requestDtc(): Promise<DtcCode[]>;
    /**
     * Совместимость: alias в верблюжьем регистре
     */
    readDtc(): Promise<ObdResult<ObdDtc[]>>;
    /**
     * Совместимость: camelCase версия очистки DTC
     */
    clearDtc(): Promise<void>;
    private updateQueueDepthMetric;
    private startWatchdog;
    private stopWatchdog;
    private cleanupNobleListeners;
    private cleanupPeripheralListeners;
    /** Полное завершение активности драйвера (для тестовой среды) */
    shutdown(): Promise<void>;
}
