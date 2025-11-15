export interface AutoDetectOptions {
    /** Optional hint list to prioritise certain port paths. */
    portHints?: string[];
    /** Baud rates to probe. Defaults to [38400, 115200, 9600]. */
    baudRates?: number[];
    /** Timeout for identification commands. Defaults to 1500ms. */
    timeoutMs?: number;
    /** Optional keep-alive interval applied after detection (ms). */
    keepAliveIntervalMs?: number;
    /** Optional logger callback for diagnostics. */
    logger?: (message: string) => void;
    /** Protocol profile name (e.g., 'toyota_lexus') */
    protocolProfile?: string;
    /** Manual protocol override */
    protocol?: string;
}
export interface AutoDetectResult {
    driver: unknown;
    portPath: string;
    baudRate: number;
    identity: string;
    portInfo: SerialPortPortInfo;
}
export type SerialPortPortInfo = {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    pnpId?: string;
    locationId?: string;
    productId?: string;
    vendorId?: string;
    friendlyName?: string;
    [key: string]: unknown;
};
export declare function autoDetectElm327(options?: AutoDetectOptions): Promise<AutoDetectResult | null>;
