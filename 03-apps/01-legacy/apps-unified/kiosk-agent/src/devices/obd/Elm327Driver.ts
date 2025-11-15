/**
 * DEPRECATED: легаси ELM327 реализация.
 * Для агента BLE-режим реализован в `@selfservice/obd-diagnostics` (KINGBOLEN Ediag).
 * Если требуется поддержка Serial ELM327 — перенесите транспорт в общий пакет.
 * Этот файл оставлен как совместимый слой, всегда кидает понятную ошибку.
 */

class _Elm327DriverDisabled {
  constructor() {
    throw new Error('[Elm327Driver] Легаси реализация отключена. Используйте KingbolenEdiagDriver из @selfservice/obd-diagnostics.');
  }
}

export { _Elm327DriverDisabled as Elm327Driver };
export default _Elm327DriverDisabled;

import { EventEmitter } from 'events';
import { describeDtc, DtcSeverity } from './dtcDescriptions.js';
import { Elm327Transport, SerialPortTransport } from './transports.js';
import { getProtocolProfile, getProtocolCommand, type ObdProtocol } from './protocolProfiles.js';
import { parsePid as parsePidValue } from './pidDecoders.js';
import { parsePid } from './pidDecoders.js';

export type ObdDtc = {
  code: string;
  description?: string;
  status?: 'current' | 'pending' | 'permanent';
  severity?: DtcSeverity;
};

export type ObdResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ObdStatus {
  milOn: boolean;
  dtcCount: number;
  readiness: {
    misfire: boolean;
    fuelSystem: boolean;
    components: boolean;
    catalyst: boolean;
    heatedCatalyst: boolean;
    evapSystem: boolean;
    secondaryAirSystem: boolean;
    acRefrigerant: boolean;
    oxygenSensor: boolean;
    oxygenSensorHeater: boolean;
    egrSystem: boolean;
  };
}

export interface ObdLiveData {
  rpm?: number;
  coolantTempC?: number;
  intakeTempC?: number;
  vehicleSpeedKmh?: number;
  batteryVoltageV?: number;
  throttlePosPercent?: number;
}

export interface Elm327Options {
  portPath?: string; // e.g. COM3 (required if transport не передан)
  baudRate?: number; // defaults 38400 or 9600 depending on adapter
  timeoutMs?: number; // per-command timeout
  keepAliveIntervalMs?: number; // optional keep-alive ping interval
  transport?: Elm327Transport; // переопределение транспорта (например, Bluetooth)
  protocolProfile?: string; // название профиля (toyota_lexus, auto, и т.д.)
  protocol?: ObdProtocol; // ручное указание протокола (переопределяет профиль)
}

export interface Elm327DriverMetrics {
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  timeouts: number;
  averageLatencyMs: number;
  lastCommand?: string;
  lastDurationMs?: number;
  lastError?: string;
  lastUpdatedAt?: string;
  protocolUsed?: ObdProtocol;
}

export class Elm327Driver extends EventEmitter {
  private readonly options: {
    portPath?: string;
    baudRate: number;
    timeoutMs: number;
    keepAliveIntervalMs: number;
    protocolProfile?: string;
    protocol?: ObdProtocol;
  };
  private readonly transport: Elm327Transport;
  private commandQueue: Promise<unknown> = Promise.resolve();
  private keepAliveTimer?: NodeJS.Timeout;
  private isOpen = false;
  private responseBuffer = '';
  private pendingResponse?: {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  };
  private readonly onTransportClose = () => this.handleTransportClosed();
  private readonly onTransportError = (error: Error) => this.handleTransportError(error);
  private metrics: Elm327DriverMetrics = {
    totalCommands: 0,
    successfulCommands: 0,
    failedCommands: 0,
    timeouts: 0,
    averageLatencyMs: 0,
  };

  constructor(opts: Elm327Options) {
    super();
    if (!opts.transport && !opts.portPath) {
      throw new Error('Elm327Driver requires either transport or portPath');
    }

    this.options = {
      baudRate: opts.baudRate ?? 38400,
      timeoutMs: opts.timeoutMs ?? 2000,
      portPath: opts.portPath,
      keepAliveIntervalMs: opts.keepAliveIntervalMs ?? 0,
      protocolProfile: opts.protocolProfile,
      protocol: opts.protocol,
    };
    this.transport = opts.transport ?? new SerialPortTransport({
      path: this.options.portPath!,
      baudRate: this.options.baudRate,
    });
  }

  async open(): Promise<void> {
    if (this.isOpen) return;

    try {
      await this.transport.open();
      this.transport.onData(this.handleTransportData);
      this.transport.onClose(this.onTransportClose);
      this.transport.onError(this.onTransportError);
      this.isOpen = true;
      this.responseBuffer = '';
      this.pendingResponse = undefined;

      await this.initialiseAdapter();
    } catch (error) {
      await this.safeTransportTeardown();
      throw error;
    }
  }

  async close(): Promise<void> {
    this.stopKeepAlive();
    if (!this.isOpen) {
      return;
    }

    this.transport.offData(this.handleTransportData);
    this.transport.offClose(this.onTransportClose);
    this.transport.offError(this.onTransportError);
    await this.transport.close();
    this.handleTransportClosed();
  }

  private async cmd(command: string): Promise<string> {
    const run = async (): Promise<string> => {
      if (!this.isOpen) throw new Error('Transport not open');

      const startedAt = Date.now();
      this.metrics = {
        ...this.metrics,
        totalCommands: this.metrics.totalCommands + 1,
        lastCommand: command,
        lastUpdatedAt: new Date().toISOString(),
      };

      const responsePromise = this.waitForResponse();

      try {
        await this.transport.write(`${command}\r`);
        const response = await responsePromise;
        const duration = Date.now() - startedAt;
        const successfulCommands = this.metrics.successfulCommands + 1;
        const averageLatencyMs = successfulCommands === 0
          ? 0
          : ((this.metrics.averageLatencyMs * this.metrics.successfulCommands) + duration) / successfulCommands;
        this.metrics = {
          ...this.metrics,
          successfulCommands,
          averageLatencyMs,
          lastDurationMs: duration,
          lastError: undefined,
          lastUpdatedAt: new Date().toISOString(),
        };
        this.emit('command', { command, durationMs: duration, ok: true });
        return response;
      } catch (error) {
        const duration = Date.now() - startedAt;
        const message = error instanceof Error ? error.message : String(error);
        const isTimeout = message.toLowerCase().includes('timeout');
        this.metrics = {
          ...this.metrics,
          failedCommands: this.metrics.failedCommands + 1,
          timeouts: this.metrics.timeouts + (isTimeout ? 1 : 0),
          lastDurationMs: duration,
          lastError: message,
          lastUpdatedAt: new Date().toISOString(),
        };
        this.emit('command', { command, durationMs: duration, ok: false, error: message });
        throw error;
      }
    };

    const result = this.commandQueue.then(run, run);
    this.commandQueue = result
      .then(() => undefined)
      .catch(() => undefined);
    return result;
  }

  async readDtc(): Promise<ObdResult<ObdDtc[]>> {
    try {
      // Mode 03 — stored DTC
      const resp = await this.cmd('03');
      const codes = parseDtcFromResponse(resp).map(c => {
        const meta = describeDtc(c.code);
        return { ...c, description: meta.description, severity: meta.severity, status: c.status } as ObdDtc;
      });
      return { ok: true, data: codes };
    } catch (e: any) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  async clearDtc(): Promise<ObdResult<null>> {
    try {
      // Mode 04 — clear DTC
      await this.cmd('04');
      return { ok: true, data: null };
    } catch (e: any) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  async readStatus(): Promise<ObdResult<ObdStatus>> {
    try {
      const resp = await this.cmd('0101');
      const parsed = parseStatusFromResponse(resp);
      if (!parsed) return { ok: false, error: 'No status data' };
      return { ok: true, data: parsed };
    } catch (e: any) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  async readLiveData(): Promise<ObdResult<ObdLiveData>> {
    try {
      const [p0C, p05, p0F, p0D, p42, p11] = await Promise.all([
        this.readPid('0C'),
        this.readPid('05'),
        this.readPid('0F'),
        this.readPid('0D'),
        this.readPid('42'),
        this.readPid('11'),
      ]);
      const data: ObdLiveData = {
        rpm: p0C != null ? (parsePidValue('0C', p0C) as number | undefined) : undefined,
        coolantTempC: p05 != null ? (parsePidValue('05', p05) as number | undefined) : undefined,
        intakeTempC: p0F != null ? (parsePidValue('0F', p0F) as number | undefined) : undefined,
        vehicleSpeedKmh: p0D != null ? (parsePidValue('0D', p0D) as number | undefined) : undefined,
        batteryVoltageV: p42 != null ? (parsePidValue('42', p42) as number | undefined) : undefined,
        throttlePosPercent: p11 != null ? (parsePidValue('11', p11) as number | undefined) : undefined,
      };
      return { ok: true, data };
    } catch (e: any) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  private async readPid(pid: string): Promise<string | null> {
    const resp = await this.cmd(`01${pid}`);
    return extractMode01Payload(pid, resp);
  }

  async identify(): Promise<string> {
    try {
      const resp = await this.cmd('ATI');
      return resp.trim();
    } catch (error) {
      throw new Error(`Failed to identify adapter: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  startKeepAlive(intervalMs = 45000): void {
    this.stopKeepAlive();
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      return;
    }
    this.keepAliveTimer = setInterval(() => {
      this.cmd('0100').catch(() => {
        // swallow errors; watchdog/self-check will surface persistent failures
      });
    }, intervalMs);
  }

  stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }

  private async initialiseAdapter(): Promise<void> {
    // Basic init sequence per ELM327
    await this.cmd('ATZ'); // reset
    await this.cmd('ATE0'); // echo off
    await this.cmd('ATL0'); // linefeeds off
    await this.cmd('ATS0'); // spaces off
    await this.cmd('ATH1'); // headers on (optional)

    // Протокольная инициализация с профилем или вручную
    if (this.options.protocol) {
      // Ручное указание протокола переопределяет профиль
      const protocolCmd = getProtocolCommand(this.options.protocol);
      await this.cmd(protocolCmd);
      this.metrics.protocolUsed = this.options.protocol;
    } else {
      // Используем профиль (по умолчанию 'auto')
      const profile = getProtocolProfile(this.options.protocolProfile);

      // Выполняем дополнительные команды инициализации профиля
      if (profile.initCommands) {
        for (const cmd of profile.initCommands) {
          try {
            await this.cmd(cmd);
          } catch (error) {
            // Логируем, но не падаем на дополнительных командах
            console.warn(`[elm327] optional init command failed: ${cmd}`, error);
          }
        }
      }

      // Пробуем протоколы из профиля по приоритету
      let protocolSet = false;
      for (const protocol of profile.protocols) {
        try {
          const protocolCmd = getProtocolCommand(protocol);
          await this.cmd(protocolCmd);
          // Проверяем, что протокол работает, запросив базовый PID
          const testResp = await this.cmd('0100');
          if (testResp && !testResp.includes('UNABLE TO CONNECT') && !testResp.includes('NO DATA')) {
            this.metrics.protocolUsed = protocol;
            protocolSet = true;
            break;
          }
        } catch (error) {
          // Продолжаем пробовать следующий протокол
          continue;
        }
      }

      if (!protocolSet) {
        // Fallback на автоопределение, если ничего не подошло
        await this.cmd('ATSP0');
        this.metrics.protocolUsed = 'auto';
      }
    }

    if (this.options.keepAliveIntervalMs > 0) {
      this.startKeepAlive(this.options.keepAliveIntervalMs);
    }
  }

  private waitForResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.pendingResponse) {
        this.pendingResponse.reject(new Error('Previous response pending'));
        clearTimeout(this.pendingResponse.timer);
      }

      const timer = setTimeout(() => {
        if (this.pendingResponse && this.pendingResponse.timer === timer) {
          this.pendingResponse = undefined;
        }
        reject(new Error('Timeout'));
      }, this.options.timeoutMs);

      this.pendingResponse = {
        resolve: (value: string) => {
          clearTimeout(timer);
          this.pendingResponse = undefined;
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          this.pendingResponse = undefined;
          reject(error);
        },
        timer,
      };

      this.flushBuffer();
    });
  }

  private readonly handleTransportData = (chunk: string): void => {
    if (!chunk) return;
    this.responseBuffer += chunk.replace(/\r/g, '');
    this.flushBuffer();
  };

  private flushBuffer(): void {
    if (!this.pendingResponse) return;
    const delimiterIndex = this.responseBuffer.indexOf('>');
    if (delimiterIndex === -1) return;

    const rawResponse = this.responseBuffer.slice(0, delimiterIndex);
    const remainder = this.responseBuffer.slice(delimiterIndex + 1);
    this.responseBuffer = remainder;

    const sanitized = rawResponse
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    this.pendingResponse?.resolve(sanitized);
  }

  private async safeTransportTeardown(): Promise<void> {
    try {
      this.transport.offData(this.handleTransportData);
      this.transport.offClose(this.onTransportClose);
      this.transport.offError(this.onTransportError);
    } catch {
      // ignore listener cleanup errors
    }
    try {
      await this.transport.close();
    } catch {
      // ignore close errors
    }
    this.handleTransportClosed();
  }

  private handleTransportClosed(error?: Error): void {
    if (!this.isOpen) {
      this.responseBuffer = '';
      this.commandQueue = Promise.resolve();
      return;
    }
    try {
      this.transport.offData(this.handleTransportData);
      this.transport.offClose(this.onTransportClose);
      this.transport.offError(this.onTransportError);
    } catch {
      // ignore listener cleanup errors
    }
    this.isOpen = false;
    this.stopKeepAlive();
    this.responseBuffer = '';
    const pending = this.pendingResponse;
    if (pending) {
      pending.reject(error ?? new Error('Transport closed'));
    }
    this.pendingResponse = undefined;
    this.commandQueue = Promise.resolve();
    this.metrics = {
      ...this.metrics,
      lastError: error?.message ?? 'Transport closed',
      lastUpdatedAt: new Date().toISOString(),
    };
    this.emit('disconnect');
  }

  private handleTransportError(error: Error): void {
    this.emit('error', error);
    this.handleTransportClosed(error);
  }

  getMetrics(): Elm327DriverMetrics {
    return { ...this.metrics };
  }
}

// --- helpers ---

function parseDtcFromResponse(resp: string): ObdDtc[] {
  // Basic parser for lines like: 43 01 33 00 00 00 or with headers
  // We'll strip non-hex and decode 2 bytes -> one DTC
  const hex = resp
    .split(/\s+/)
    .filter(x => /^[0-9A-Fa-f]{2}$/.test(x))
    .map(x => x.toUpperCase());

  // Look for a line starting with 43 (Mode 03 response)
  // Many adapters include multiple lines; just parse all bytes after first 43 occurrence
  const idx = hex.indexOf('43');
  if (idx === -1) return [];
  const data = hex.slice(idx + 1);

  const dtcs: ObdDtc[] = [];
  for (let i = 0; i + 1 < data.length; i += 2) {
    const A = parseInt(data[i], 16);
    const B = parseInt(data[i + 1], 16);
    const code = decodeDtc(A, B);
    if (code !== 'P0000') dtcs.push({ code });
  }
  return dtcs;
}

function decodeDtc(A: number, B: number): string {
  // Per SAE J2012: first two bytes encode one DTC
  const firstNibble = (A & 0xC0) >> 6; // 2 bits
  const secondNibble = (A & 0x30) >> 4;
  const thirdNibble = A & 0x0F;
  const fourthNibble = (B & 0xF0) >> 4;
  const fifthNibble = B & 0x0F;

  const system = ['P', 'C', 'B', 'U'][firstNibble] ?? 'P';
  return `${system}${secondNibble}${thirdNibble}${fourthNibble}${fifthNibble}`;
}

function parseStatusFromResponse(resp: string): ObdStatus | null {
  const hex = resp
    .split(/\s+/)
    .filter(x => /^[0-9A-Fa-f]{2}$/.test(x))
    .map(x => x.toUpperCase());
  const idx = hex.indexOf('41');
  if (idx === -1) return null;
  if (hex[idx + 1] !== '01') return null;
  const bytes = hex.slice(idx + 2).map(x => parseInt(x, 16));
  if (bytes.length < 4) return null;
  const [A, B, C, D] = bytes;
  const milOn = (A & 0x80) === 0x80;
  const dtcCount = A & 0x7f;
  const sparkEngine = (B & 0x08) === 0; // bit3 indicates spark or compression
  const readiness = decodeReadiness({ B, C, D, sparkEngine });
  return { milOn, dtcCount, readiness };
}

function extractMode01Payload(pid: string, resp: string): string | null {
  const targetPid = pid.toUpperCase();
  const hex = resp
    .split(/\s+/)
    .filter(x => /^[0-9A-Fa-f]{2}$/.test(x))
    .map(x => x.toUpperCase());
  for (let i = 0; i < hex.length - 2; i++) {
    if (hex[i] === '41' && hex[i + 1] === targetPid) {
      return hex.slice(i + 2).join(' ');
    }
  }
  return null;
}

function parseRpm(payload: string): number {
  const [A, B] = payload.split(' ').map(x => parseInt(x, 16));
  if (Number.isNaN(A) || Number.isNaN(B)) return NaN;
  return ((A * 256) + B) / 4;
}

function parseTemperature(payload: string): number {
  const A = parseInt(payload.split(' ')[0], 16);
  if (Number.isNaN(A)) return NaN;
  return A - 40;
}

function parseSpeed(payload: string): number {
  const A = parseInt(payload.split(' ')[0], 16);
  if (Number.isNaN(A)) return NaN;
  return A;
}

function parseVoltage(payload: string): number {
  const parts = payload.split(' ').map(x => parseInt(x, 16));
  if (parts.length < 2 || parts.some(Number.isNaN)) return NaN;
  return ((parts[0] * 256) + parts[1]) / 1000;
}

function parseThrottle(payload: string): number {
  const A = parseInt(payload.split(' ')[0], 16);
  if (Number.isNaN(A)) return NaN;
  return (A * 100) / 255;
}

function decodeReadiness({ B, C, D, sparkEngine }: { B: number; C: number; D: number; sparkEngine: boolean }) {
  // Continuous monitors (always the same bits)
  const misfire = (B & 0x01) === 0;
  const fuelSystem = (B & 0x02) === 0;
  const components = (B & 0x04) === 0;

  // For spark vs compression engines different mapping for C & D
  if (sparkEngine) {
    return {
      misfire,
      fuelSystem,
      components,
      catalyst: (C & 0x01) === 0,
      heatedCatalyst: (C & 0x02) === 0,
      evapSystem: (C & 0x04) === 0,
      secondaryAirSystem: (C & 0x08) === 0,
      acRefrigerant: (C & 0x10) === 0,
      oxygenSensor: (C & 0x20) === 0,
      oxygenSensorHeater: (C & 0x40) === 0,
      egrSystem: (C & 0x80) === 0,
    };
  }
  // Compression-ignition (diesel)
  return {
    misfire,
    fuelSystem,
    components,
    catalyst: (D & 0x01) === 0,
    heatedCatalyst: (D & 0x02) === 0,
    evapSystem: (D & 0x04) === 0,
    secondaryAirSystem: true,
    acRefrigerant: (D & 0x08) === 0,
    oxygenSensor: (D & 0x10) === 0,
    oxygenSensorHeater: true,
    egrSystem: (D & 0x20) === 0,
  };
}
