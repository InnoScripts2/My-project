/**
 * ELM327 Driver - Low-Level OBD-II Driver Implementation
 * Implements DeviceObd interface with full ELM327 protocol support
 * Features: command queue, retry logic, reconnection, status management, events
 */
import { EventEmitter } from 'events';
import { DeviceObd, ObdStatus, type DtcEntry, type PidValue, type ObdConfig } from './DeviceObd.js';
/**
 * Driver metrics for monitoring
 */
export interface Elm327Metrics {
    totalCommands: number;
    successfulCommands: number;
    failedCommands: number;
    timeouts: number;
    averageLatencyMs: number;
    lastCommand?: string;
    lastDurationMs?: number;
    lastError?: string;
    lastUpdatedAt?: string;
}
/**
 * ELM327 Driver Implementation
 */
export declare class Elm327Driver extends EventEmitter implements DeviceObd {
    private transport?;
    private config;
    private status;
    private responseBuffer;
    private commandQueue;
    private activeCommand?;
    private isProcessingQueue;
    private pendingResponse?;
    private supportedPids;
    private pidDatabase;
    private metrics;
    private reconnectTimer?;
    private reconnectAttempt;
    constructor();
    /**
     * Initialize adapter
     */
    init(config: ObdConfig): Promise<void>;
    /**
     * Read diagnostic trouble codes (Mode 03)
     */
    readDtc(): Promise<DtcEntry[]>;
    /**
     * Clear diagnostic trouble codes (Mode 04)
     */
    clearDtc(): Promise<boolean>;
    /**
     * Read PID value (Mode 01)
     */
    readPid(pid: string): Promise<PidValue>;
    /**
     * Get current status
     */
    getStatus(): ObdStatus;
    /**
     * Disconnect from adapter
     */
    disconnect(): Promise<void>;
    /**
     * Get current metrics
     */
    getMetrics(): Elm327Metrics;
    /**
     * Connect to transport
     */
    private connect;
    /**
     * Initialize ELM327 adapter
     */
    private initializeAdapter;
    /**
     * Send command with priority and retry logic
     */
    private sendCommand;
    /**
     * Process command queue
     */
    private processQueue;
    /**
     * Execute single command
     */
    private executeCommand;
    /**
     * Handle incoming data from transport
     */
    private readonly handleData;
    /**
     * Try to complete response
     */
    private tryCompleteResponse;
    /**
     * Handle transport close
     */
    private readonly handleClose;
    /**
     * Handle transport error
     */
    private readonly handleError;
    /**
     * Attempt reconnection
     */
    private attemptReconnect;
    /**
     * Update status and emit event
     */
    private updateStatus;
    /**
     * Parse DTC response
     */
    private parseDtcResponse;
    /**
     * Parse PID response
     */
    private parsePidResponse;
    /**
     * Parse supported PIDs from 0100 response
     */
    private parseSupportedPids;
    /**
     * Utility delay function
     */
    private delay;
}
