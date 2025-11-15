import { DecodeResult, DecodedValue, HexString, hexToBytes } from "./types.js";
import { decodePid } from "./pids.js";

// Parse a single-line OBD response like: "41 0C 1A F8"
export function parseMode01Line(line: string): { pid: number; payload: Uint8Array } {
  const clean = line.trim().replace(/\s+/g, " ");
  const parts = clean.split(" ");
  if (parts.length < 2) throw new Error("invalid OBD response line");
  const mode = parseInt(parts[0], 16);
  if (isNaN(mode) || mode !== 0x41) throw new Error(`unexpected mode 0x${mode.toString(16)}`);
  const pid = parseInt(parts[1], 16);
  const dataHex = parts.slice(2).join("");
  const payload = hexToBytes(dataHex);
  return { pid, payload };
}

export function decodeMode01(line: string): DecodeResult<any> {
  try {
    const { pid, payload } = parseMode01Line(line);
    const decoded: DecodedValue<any> = decodePid(pid, payload);
    return { ok: true, data: decoded };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
