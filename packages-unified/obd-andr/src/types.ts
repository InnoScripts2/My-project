export type HexString = string; // like "410C1AF8"

export interface PidDefinition<T = unknown> {
  pid: number; // 0x0C
  mode: number; // 0x01 by default
  bytes: number; // response payload length in bytes (excluding mode/pid)
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

export type DecodeResult<T = unknown> =
  | { ok: true; data: DecodedValue<T> }
  | { ok: false; error: string };

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s|0x/gi, "").toUpperCase();
  if (clean.length % 2 !== 0) throw new Error("hex length must be even");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
