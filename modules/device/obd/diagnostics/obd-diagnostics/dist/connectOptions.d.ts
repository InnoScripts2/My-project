import type { ObdConnectOptions } from './ObdConnectionManager.js';
export interface ParsedObdConnectPayload {
    options: ObdConnectOptions;
    issues: string[];
}
export declare function parseObdConnectPayload(payload: unknown): ParsedObdConnectPayload;
export declare function formatObdError(error: unknown): string;
