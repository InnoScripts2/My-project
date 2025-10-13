// Minimal stub for serial ELM327 auto-detection in DEV. We prioritize BLE; return null to skip serial probing.
import type { Elm327Driver } from './Elm327Driver.js';

export interface AutoDetectOptions {
  portHints?: string[];
  baudRates?: number[];
  timeoutMs?: number;
  keepAliveIntervalMs?: number;
  logger?: (message: string) => void;
}

export interface AutoDetectResult {
  portPath: string;
  baudRate: number;
  identity?: string;
  driver?: Elm327Driver;
}

export async function autoDetectElm327(_options: AutoDetectOptions = {}): Promise<AutoDetectResult | null> {
  // No-op: serial auto-detection is disabled in this build
  return null;
}
