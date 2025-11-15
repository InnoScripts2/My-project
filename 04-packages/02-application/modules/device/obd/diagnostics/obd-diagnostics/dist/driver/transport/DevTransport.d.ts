/**
 * DEV Mock Transport
 * Simulates ELM327 responses for testing without real hardware
 * Only available in DEV mode (AGENT_ENV=DEV)
 */
import { EventEmitter } from 'events';
import type { Elm327Transport } from '../../transports.js';
/**
 * Mock Transport for DEV testing
 */
export declare class DevTransport extends EventEmitter implements Elm327Transport {
    private isOpen;
    private responseDelay;
    private simulateErrors;
    private errorRate;
    private dataListener?;
    constructor(options?: {
        responseDelay?: number;
        simulateErrors?: boolean;
        errorRate?: number;
    });
    open(): Promise<void>;
    close(): Promise<void>;
    write(data: string): Promise<void>;
    onData(listener: (chunk: string) => void): void;
    offData(listener: (chunk: string) => void): void;
    onClose(listener: () => void): void;
    offClose(listener: () => void): void;
    onError(listener: (error: Error) => void): void;
    offError(listener: (error: Error) => void): void;
    /**
     * Get mock response for command
     */
    private getMockResponse;
    /**
     * Simulate network delay
     */
    private delay;
    /**
     * Set specific response for command (for testing)
     */
    setMockResponse(command: string, response: string): void;
    /**
     * Simulate connection loss
     */
    simulateDisconnect(): void;
    /**
     * Simulate error
     */
    simulateError(errorMessage: string): void;
}
