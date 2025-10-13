export type HexString = string;
export interface PidDefinition<T = unknown> {
    pid: number;
    mode: number;
    bytes: number;
    decode: (data: Uint8Array) => T;
    unit?: string;
    name: string;
}
export interface DecodedValue<T = unknown> {
    pid: number;
    mode: number;
    name: string;
    unit?: string;
    value: T;
}
export interface ElmCommand {
    cmd: string;
    description?: string;
}
export type DecodeResult<T = unknown> = {
    ok: true;
    data: DecodedValue<T>;
} | {
    ok: false;
    error: string;
};
export declare function hexToBytes(hex: string): Uint8Array;
export declare function bytesToHex(bytes: Uint8Array): string;
