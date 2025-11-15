export interface BluetoothAutoDetectOptions {
    deviceHints?: string[];
    channelHints?: number[];
    discoveryTimeoutMs?: number;
    timeoutMs?: number;
    keepAliveIntervalMs?: number;
    logger?: (message: string) => void;
}
export interface BluetoothAutoDetectResult {
    address: string;
    name?: string;
    channel: number;
    identity: string;
}
export declare function autoDetectBluetoothElm327(_options?: BluetoothAutoDetectOptions): Promise<BluetoothAutoDetectResult | null>;
