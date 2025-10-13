// Decode a single DTC from two bytes as per SAE J2012
export function decodeDtcFromBytes(a: number, b: number): string {
  const systemCodes = ["P", "C", "B", "U"]; // two MSB of first byte
  const hi = (a & 0xC0) >> 6;
  const system = systemCodes[hi] ?? "P";
  const n1 = (a & 0x30) >> 4; // first digit
  const n2 = (a & 0x0F);      // second digit
  const n3 = (b & 0xF0) >> 4; // third digit
  const n4 = (b & 0x0F);      // fourth digit
  return `${system}${n1}${n2}${n3}${n4}`;
}

export function decodeDtcList(payload: Uint8Array): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < payload.length; i += 2) {
    const a = payload[i];
    const b = payload[i + 1];
    const code = decodeDtcFromBytes(a, b);
    if (code === "P0000") continue; // ignore no-code entries
    out.push(code);
  }
  return out;
}
