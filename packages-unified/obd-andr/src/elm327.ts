import { ElmCommand } from "./types.js";

export const ELM: Record<string, ElmCommand> = {
  atZ: { cmd: "AT Z", description: "Reset" },
  atE0: { cmd: "AT E0", description: "Echo off" },
  atL0: { cmd: "AT L0", description: "Linefeeds off" },
  atS0: { cmd: "AT S0", description: "Spaces off" },
  atSP0: { cmd: "AT SP 0", description: "Automatic protocol" },
  atH0: { cmd: "AT H0", description: "Headers off" },
  atH1: { cmd: "AT H1", description: "Headers on" },
  atAL: { cmd: "AT AL", description: "Allow long" },
};

export function buildMode01PidRequest(pid: number): string {
  if (pid < 0 || pid > 0xff) throw new Error("pid out of range");
  const pidHex = pid.toString(16).padStart(2, "0").toUpperCase();
  return `01 ${pidHex}`;
}
