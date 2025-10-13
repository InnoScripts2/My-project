import { DecodedValue, PidDefinition } from "./types.js";
export declare const PID_0x0C_RPM: PidDefinition<number>;
export declare const PID_0x0D_SPEED: PidDefinition<number>;
export declare const PID_0x05_COOLANT: PidDefinition<number>;
export declare const PID_REGISTRY: Record<number, PidDefinition<any>>;
export declare function decodePid(pid: number, payload: Uint8Array): DecodedValue<any>;
