import { DecodeResult } from "./types.js";
export declare function parseMode01Line(line: string): {
    pid: number;
    payload: Uint8Array;
};
export declare function decodeMode01(line: string): DecodeResult<any>;
