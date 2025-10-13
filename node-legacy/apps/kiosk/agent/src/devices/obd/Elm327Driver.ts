/**
 * Elm327Driver - полноценный драйвер для OBD-II адаптера ELM327
 * Реализует протокол ELM327 и интерфейс DeviceObd
 */

import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { DeviceObd, ObdConfig, ObdStatus, DtcEntry, PidValue } from './driver/DeviceObd.js';
import { DeviceState } from '../common/interfaces.js';
import {
  DeviceConnectionError,
  DeviceTimeoutError,
  DeviceProtocolError,
} from '../common/errors.js';
import { retryWithPolicy, DEFAULT_RETRY_POLICY } from '../common/retry.js';
import { createLogger } from '../common/logger.js';
import { getDeviceStorage } from '../common/storage.js';
import { INIT_COMMANDS, DIAGNOSTIC_COMMANDS, createPidCommand } from './commands/index.js';
import { dtcDatabase } from './database/DtcDatabase.js';
import { pidDatabase } from './database/PidDatabase.js';

const logger = createLogger('Elm327Driver');
const storage = getDeviceStorage();

// Export types for compatibility with existing code
export { ObdStatus, DtcEntry, PidValue };
export type ObdDtc = DtcEntry;
export type ObdResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type ObdLiveData = Record<string, any>;

export interface Elm327Options extends ObdConfig {
  maxRetries?: number;
  commandTimeout?: number;
}

export interface Elm327DriverMetrics {
  successfulOperations: number;
  failedOperations: number;
  totalOperations: number;
  averageResponseTimeMs: number;
  protocol?: string | null;
}

export class Elm327Driver extends EventEmitter implements DeviceObd {
  private port: SerialPort | null = null;
  private state: DeviceState = DeviceState.DISCONNECTED;
  private config: Elm327Options | null = null;
  private responseBuffer: string = '';
  private pendingCommand: {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  } | null = null;
  private protocol: string | null = null;
  private metrics = {
    successfulOperations: 0,
    failedOperations: 0,
    totalOperations: 0,
    totalResponseTime: 0,
  };

  /** Получить агрегированные метрики драйвера */
  getMetrics(): Elm327DriverMetrics {
    const avg = this.metrics.totalOperations > 0
      ? Math.round(this.metrics.totalResponseTime / this.metrics.totalOperations)
      : 0;
    return {
      successfulOperations: this.metrics.successfulOperations,
      failedOperations: this.metrics.failedOperations,
      totalOperations: this.metrics.totalOperations,
      averageResponseTimeMs: avg,
      protocol: this.protocol,
    };
  }


  constructor() {
    super();
  }

  async init(config: ObdConfig): Promise<void> {
    this.config = config as Elm327Options;
    this.state = DeviceState.CONNECTING;
    this.emit('state_changed', DeviceState.CONNECTING);

    logger.info('Initializing Elm327Driver', { config });

    try {
      await retryWithPolicy(
        async (attempt) => {
          logger.debug(`Connection attempt ${attempt}`, { config });
          await this.connect();
          await this.initialize();
        },
        DEFAULT_RETRY_POLICY,
        (attempt, delayMs) => {
          logger.debug(`Starting connection attempt ${attempt} after ${delayMs}ms`);
        },
        (attempt, error) => {
          logger.warn(`Connection attempt ${attempt} failed`, { error });
          storage.recordEvent({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            deviceType: 'obd',
            eventType: 'reconnect_attempt',
            state: 'connecting',
            metadata: JSON.stringify({ attempt, error: String(error) }),
          });
        }
      );

      this.state = DeviceState.READY;
      this.emit('state_changed', DeviceState.READY);
      this.emit('connected');

      storage.saveState({
        deviceType: 'obd',
        state: 'connected',
        connected: true,
        lastConnected: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: JSON.stringify({ protocol: this.protocol }),
      });

      storage.recordEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        deviceType: 'obd',
        eventType: 'connected',
        state: 'connected',
        previousState: 'disconnected',
        metadata: JSON.stringify({ protocol: this.protocol }),
      });

      logger.info('Elm327Driver initialized successfully', { protocol: this.protocol });
    } catch (error) {
      this.state = DeviceState.ERROR;
      this.emit('state_changed', DeviceState.ERROR);
      this.emit('error', error);

      storage.saveState({
        deviceType: 'obd',
        state: 'error',
        connected: false,
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      });

      storage.recordEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        deviceType: 'obd',
        eventType: 'error',
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
      });

      logger.error('Failed to initialize Elm327Driver', { error });
      throw new DeviceConnectionError('Failed to initialize OBD adapter', { error });
    }
  }

  private async connect(): Promise<void> {
    if (!this.config) {
      throw new DeviceConnectionError('Driver not configured');
    }

    if (this.config.transport === 'serial') {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new DeviceTimeoutError('Connection timeout'));
        }, this.config?.timeout || 5000);

        try {
          this.port = new SerialPort({
            path: this.config!.port,
            baudRate: this.config!.baudRate || 38400,
            autoOpen: false,
          });

          this.port.on('data', (data: Buffer) => {
            this.handleData(data);
          });

          this.port.on('error', (error) => {
            logger.error('Serial port error', { error });
            this.emit('error', error);
          });

          this.port.on('close', () => {
            logger.info('Serial port closed');
            this.handleDisconnect();
          });

          this.port.open((error) => {
            clearTimeout(timeout);
            if (error) {
              reject(new DeviceConnectionError('Failed to open serial port', { error }));
            } else {
              logger.debug('Serial port opened');
              resolve();
            }
          });
        } catch (error) {
          clearTimeout(timeout);
          reject(new DeviceConnectionError('Failed to create serial port', { error }));
        }
      });
    } else {
      throw new DeviceConnectionError('Only serial transport is currently supported');
    }
  }

  private async initialize(): Promise<void> {
    logger.debug('Starting ELM327 initialization sequence');

    for (const cmd of INIT_COMMANDS) {
      logger.debug(`Sending init command: ${cmd.name}`, { command: cmd.command });
      const response = await this.sendCommand(cmd.command, cmd.timeout);
      logger.debug(`Init command response: ${cmd.name}`, { response });

      if (cmd.name === 'RESET' && !response.includes('ELM')) {
        throw new DeviceProtocolError('Invalid ELM327 response', { response });
      }
    }

    const protocolResponse = await this.sendCommand('ATDPN');
    this.protocol = protocolResponse.trim();
    logger.info('ELM327 protocol detected', { protocol: this.protocol });
  }

  private handleData(data: Buffer): void {
    this.responseBuffer += data.toString('utf8');

    if (this.responseBuffer.includes('>')) {
      const response = this.responseBuffer.replace('>', '').trim();
      this.responseBuffer = '';

      if (this.pendingCommand) {
        clearTimeout(this.pendingCommand.timeout);
        this.pendingCommand.resolve(response);
        this.pendingCommand = null;
      }
    }
  }

  private handleDisconnect(): void {
    this.state = DeviceState.DISCONNECTED;
    this.emit('state_changed', DeviceState.DISCONNECTED);
    this.emit('disconnected');

    storage.saveState({
      deviceType: 'obd',
      state: 'disconnected',
      connected: false,
      updatedAt: new Date().toISOString(),
    });

    storage.recordEvent({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      deviceType: 'obd',
      eventType: 'disconnected',
      state: 'disconnected',
      previousState: 'connected',
    });
  }

  private sendCommand(command: string, timeout?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.port || !this.port.isOpen) {
        reject(new DeviceConnectionError('Port not open'));
        return;
      }

      const startTime = Date.now();
      const timeoutMs = timeout || this.config?.commandTimeout || 2000;

      const timeoutHandle = setTimeout(() => {
        this.pendingCommand = null;
        this.metrics.failedOperations++;
        this.metrics.totalOperations++;
        reject(new DeviceTimeoutError(`Command timeout: ${command}`, { command }));
      }, timeoutMs);

      this.pendingCommand = {
        resolve: (response) => {
          const responseTime = Date.now() - startTime;
          this.metrics.successfulOperations++;
          this.metrics.totalOperations++;
          this.metrics.totalResponseTime += responseTime;
          resolve(response);
        },
        reject: (error) => {
          this.metrics.failedOperations++;
          this.metrics.totalOperations++;
          reject(error);
        },
        timeout: timeoutHandle,
      };

      this.port.write(command + '\r', (error) => {
        if (error) {
          clearTimeout(timeoutHandle);
          this.pendingCommand = null;
          this.metrics.failedOperations++;
          this.metrics.totalOperations++;
          reject(new DeviceConnectionError('Failed to write command', { command, error }));
        }
      });
    });
  }

  async readDtc(): Promise<DtcEntry[]> {
    if (this.state !== DeviceState.READY) {
      throw new DeviceConnectionError('Device not ready');
    }

    this.state = DeviceState.BUSY;
    this.emit('state_changed', DeviceState.BUSY);

    try {
      logger.debug('Reading DTC codes');
      const response = await this.sendCommand(
        DIAGNOSTIC_COMMANDS.READ_DTC.command,
        DIAGNOSTIC_COMMANDS.READ_DTC.timeout
      );

      const dtcCodes = this.parseDtcResponse(response);
      logger.info('DTC codes read', { count: dtcCodes.length });

      this.state = DeviceState.READY;
      this.emit('state_changed', DeviceState.READY);

      return dtcCodes;
    } catch (error) {
      this.state = DeviceState.READY;
      this.emit('state_changed', DeviceState.READY);
      logger.error('Failed to read DTC codes', { error });
      throw error;
    }
  }

  private parseDtcResponse(response: string): DtcEntry[] {
    const dtcCodes: DtcEntry[] = [];

    if (response.includes('NO DATA') || response.includes('43 00')) {
      return dtcCodes;
    }

    const lines = response.split('\n').filter((line) => line.trim().length > 0);

    for (const line of lines) {
      const bytes = line.trim().split(' ').filter((b) => b.length > 0);

      if (bytes.length < 2 || bytes[0] === '43') {
        continue;
      }

      for (let i = 0; i < bytes.length; i += 2) {
        if (i + 1 >= bytes.length) break;

        const byte1 = parseInt(bytes[i], 16);
        const byte2 = parseInt(bytes[i + 1], 16);

        if (byte1 === 0 && byte2 === 0) continue;

        const dtcCode = this.decodeDtcBytes(byte1, byte2);
        const dtcInfo = dtcDatabase.getDtcInfo(dtcCode);

        dtcCodes.push({
          code: dtcCode,
          category: dtcCode.charAt(0) as 'P' | 'C' | 'B' | 'U',
          description: dtcInfo?.description,
          rawBytes: `${bytes[i]} ${bytes[i + 1]}`,
        });
      }
    }

    return dtcCodes;
  }

  private decodeDtcBytes(byte1: number, byte2: number): string {
    const firstDigit = (byte1 >> 6) & 0x03;
    const categoryMap: { [key: number]: string } = {
      0: 'P',
      1: 'C',
      2: 'B',
      3: 'U',
    };

    const category = categoryMap[firstDigit];
    const secondDigit = (byte1 >> 4) & 0x03;
    const thirdDigit = byte1 & 0x0f;
    const fourthDigit = (byte2 >> 4) & 0x0f;
    const fifthDigit = byte2 & 0x0f;

    return `${category}${secondDigit}${thirdDigit}${fourthDigit}${fifthDigit}`;
  }

  async clearDtc(): Promise<boolean> {
    if (this.state !== DeviceState.READY) {
      throw new DeviceConnectionError('Device not ready');
    }

    this.state = DeviceState.BUSY;
    this.emit('state_changed', DeviceState.BUSY);

    try {
      logger.info('Clearing DTC codes');
      const response = await this.sendCommand(
        DIAGNOSTIC_COMMANDS.CLEAR_DTC.command,
        DIAGNOSTIC_COMMANDS.CLEAR_DTC.timeout
      );

      this.state = DeviceState.READY;
      this.emit('state_changed', DeviceState.READY);

      const success = response.includes('44') || response.includes('OK');
      logger.info('DTC codes cleared', { success });

      return success;
    } catch (error) {
      this.state = DeviceState.READY;
      this.emit('state_changed', DeviceState.READY);
      logger.error('Failed to clear DTC codes', { error });
      throw error;
    }
  }

  async readPid(pidName: string): Promise<PidValue> {
    if (this.state !== DeviceState.READY) {
      throw new DeviceConnectionError('Device not ready');
    }

    const pidInfo = pidDatabase.getPidByName(pidName);
    if (!pidInfo) {
      throw new DeviceProtocolError(`Unknown PID: ${pidName}`);
    }

    this.state = DeviceState.BUSY;
    this.emit('state_changed', DeviceState.BUSY);

    try {
      const command = createPidCommand(pidInfo.pid);
      logger.debug('Reading PID', { pid: pidName, command: command.command });

      const response = await this.sendCommand(command.command, command.timeout);
      const value = this.parsePidResponse(response, pidInfo);

      this.state = DeviceState.READY;
      this.emit('state_changed', DeviceState.READY);

      return {
        pid: pidInfo.pid,
        value: value,
        unit: pidInfo.unit,
        rawBytes: response,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.state = DeviceState.READY;
      this.emit('state_changed', DeviceState.READY);
      logger.error('Failed to read PID', { pid: pidName, error });
      throw error;
    }
  }

  private parsePidResponse(response: string, pidInfo: any): number {
    const bytes = response
      .trim()
      .split(' ')
      .map((b) => parseInt(b, 16))
      .filter((b) => !isNaN(b));

    if (bytes.length < 2) {
      throw new DeviceProtocolError('Invalid PID response', { response });
    }

    const dataBytes = bytes.slice(2);

    if (dataBytes.length < pidInfo.bytes) {
      throw new DeviceProtocolError('Insufficient data bytes', { response, expected: pidInfo.bytes });
    }

    return pidInfo.convertToUseful(dataBytes[0], dataBytes[1], dataBytes[2], dataBytes[3]);
  }

  getStatus(): ObdStatus {
    switch (this.state) {
      case DeviceState.DISCONNECTED:
        return ObdStatus.DISCONNECTED;
      case DeviceState.CONNECTING:
        return ObdStatus.CONNECTING;
      case DeviceState.CONNECTED:
        return ObdStatus.INITIALIZING;
      case DeviceState.READY:
        return ObdStatus.READY;
      case DeviceState.BUSY:
        return ObdStatus.SCANNING;
      case DeviceState.ERROR:
        return ObdStatus.ERROR;
      default:
        return ObdStatus.UNAVAILABLE;
    }
  }

  getState(): DeviceState {
    return this.state;
  }

  getHealthStatus() {
    const successRate =
      this.metrics.totalOperations > 0
        ? this.metrics.successfulOperations / this.metrics.totalOperations
        : 0;

    const avgResponseTime =
      this.metrics.successfulOperations > 0
        ? this.metrics.totalResponseTime / this.metrics.successfulOperations
        : 0;

    return {
      state: this.state,
      connected: this.state === DeviceState.READY || this.state === DeviceState.BUSY,
      lastConnected: storage.getState('obd')?.lastConnected
        ? new Date(storage.getState('obd')!.lastConnected!)
        : undefined,
      lastError: storage.getState('obd')?.lastError,
      metrics: {
        successRate,
        avgResponseTime,
        totalOperations: this.metrics.totalOperations,
        failedOperations: this.metrics.failedOperations,
      },
    };
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting Elm327Driver');

    if (this.port && this.port.isOpen) {
      await new Promise<void>((resolve) => {
        this.port!.close(() => {
          logger.debug('Serial port closed');
          resolve();
        });
      });
    }

    this.port = null;
    this.state = DeviceState.DISCONNECTED;
    this.emit('state_changed', DeviceState.DISCONNECTED);
    this.emit('disconnected');

    storage.saveState({
      deviceType: 'obd',
      state: 'disconnected',
      connected: false,
      updatedAt: new Date().toISOString(),
    });
  }

  // Compatibility methods for existing code
  async open(): Promise<void> {
    if (!this.config) {
      throw new DeviceConnectionError('Driver not configured. Call init() first.');
    }
    await this.connect();
    await this.initialize();
    this.state = DeviceState.READY;
  }

  async close(): Promise<void> {
    await this.disconnect();
  }

  async identify(): Promise<string> {
    const response = await this.sendCommand('ATI');
    return response.trim();
  }

  startKeepAlive(intervalMs: number = 45000): void {
    // TODO: Implement keep-alive mechanism
    logger.debug('Keep-alive started', { intervalMs });
  }

  async readStatus(): Promise<any> {
    // TODO: Implement full status reading
    return {};
  }

  async readLiveData(): Promise<any> {
    // TODO: Implement live data reading
    return {};
  }
}
