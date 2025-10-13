import { DecodedValue, PidDefinition } from "./types.js";

function ensureLen(data: Uint8Array, n: number) {
  if (data.length < n) throw new Error(`expected ${n} bytes, got ${data.length}`);
}

export const PID_0x0C_RPM: PidDefinition<number> = {
  pid: 0x0c,
  mode: 0x01,
  bytes: 2,
  name: "Engine RPM",
  unit: "rpm",
  decode: (data) => {
    ensureLen(data, 2);
    const A = data[0];
    const B = data[1];
    return ((A * 256 + B) / 4);
  },
};

export const PID_0x0D_SPEED: PidDefinition<number> = {
  pid: 0x0d,
  mode: 0x01,
  bytes: 1,
  name: "Vehicle speed",
  unit: "km/h",
  decode: (data) => {
    ensureLen(data, 1);
    return data[0];
  },
};

export const PID_0x05_COOLANT: PidDefinition<number> = {
  pid: 0x05,
  mode: 0x01,
  bytes: 1,
  name: "Coolant temp",
  unit: "°C",
  decode: (data) => {
    ensureLen(data, 1);
    return data[0] - 40;
  },
};

export const PID_REGISTRY: Record<number, PidDefinition<any>> = {
  [PID_0x0C_RPM.pid]: PID_0x0C_RPM,
  [PID_0x0D_SPEED.pid]: PID_0x0D_SPEED,
  [PID_0x05_COOLANT.pid]: PID_0x05_COOLANT,
};

export function decodePid(pid: number, payload: Uint8Array): DecodedValue<any> {
  const def = PID_REGISTRY[pid];
  if (!def) throw new Error(`PID 0x${pid.toString(16)} not supported`);
  const value = def.decode(payload);
  return { pid: def.pid, mode: def.mode, name: def.name, unit: def.unit, value };
}
