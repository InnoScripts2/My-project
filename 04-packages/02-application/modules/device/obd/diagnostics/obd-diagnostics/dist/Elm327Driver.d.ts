import { EventEmitter } from 'events';
import { DtcSeverity } from './dtcDescriptions.js';
import { Elm327Transport } from './transports.js';
import { type ObdProtocol } from './protocolProfiles.js';
export type ObdDtc = {
    code: string;
    description?: string;
    status?: 'current' | 'pending' | 'permanent';
    severity?: DtcSeverity;
};
export type ObdResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: string;
};
export interface ObdStatus {
    milOn: boolean;
    dtcCount: number;
    readiness: {
        misfire: boolean;
        fuelSystem: boolean;
        components: boolean;
        catalyst: boolean;
        heatedCatalyst: boolean;
        evapSystem: boolean;
        secondaryAirSystem: boolean;
        acRefrigerant: boolean;
        oxygenSensor: boolean;
        oxygenSensorHeater: boolean;
        egrSystem: boolean;
    };
}
export interface ObdLiveData {
    rpm?: number;
    coolantTempC?: number;
    intakeTempC?: number;
    vehicleSpeedKmh?: number;
    batteryVoltageV?: number;
    throttlePosPercent?: number;
}
export interface Elm327Options {
    portPath?: string;
    baudRate?: number;
    timeoutMs?: number;
    keepAliveIntervalMs?: number;
    transport?: Elm327Transport;
    protocolProfile?: string;
    protocol?: ObdProtocol;
}
export interface Elm327DriverMetrics {
    totalCommands: number;
    successfulCommands: number;
    failedCommands: number;
    timeouts: number;
    averageLatencyMs: number;
    lastCommand?: string;
    lastDurationMs?: number;
    lastError?: string;
    lastUpdatedAt?: string;
    protocolUsed?: ObdProtocol;
}
export declare class Elm327Driver extends EventEmitter {
    private readonly options;
    private readonly transport;
    private commandQueue;
    private keepAliveTimer?;
    private isOpen;
    private responseBuffer;
    private pendingResponse?;
    private readonly onTransportClose;
    private readonly onTransportError;
    private metrics;
    constructor(opts: Elm327Options);
    open(): Promise<void>;
    close(): Promise<void>;
    private cmd;
    readDtc(): Promise<ObdResult<ObdDtc[]>>;
    clearDtc(): Promise<ObdResult<null>>;
    readStatus(): Promise<ObdResult<ObdStatus>>;
    readLiveData(): Promise<ObdResult<ObdLiveData>>;
    private readPid;
    identify(): Promise<string>;
    startKeepAlive(intervalMs?: number): void;
    stopKeepAlive(): void;
    private initialiseAdapter;
    private waitForResponse;
    private readonly handleTransportData;
    private flushBuffer;
    private safeTransportTeardown;
    private handleTransportClosed;
    private handleTransportError;
    getMetrics(): Elm327DriverMetrics;
}
