/**
 * OBD event type definitions
 */
import type { PidValue } from '../database/types.js';
/**
 * Event emitted when OBD adapter connects
 */
export interface ObdConnectedEvent {
    timestamp: Date;
}
/**
 * Event emitted when OBD adapter disconnects
 */
export interface ObdDisconnectedEvent {
    timestamp: Date;
    reason?: string;
}
/**
 * Event emitted when PID data is received
 */
export interface ObdDataReceivedEvent {
    pid: string;
    value: PidValue;
    timestamp: Date;
}
/**
 * Event emitted when an error occurs
 */
export interface ObdErrorEvent {
    error: Error;
    timestamp: Date;
}
