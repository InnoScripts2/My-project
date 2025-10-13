/**
 * ELM327 Driver - Low-Level OBD-II Driver Implementation
 * Implements DeviceObd interface with full ELM327 protocol support
 * Features: command queue, retry logic, reconnection, status management, events
 */

import { EventEmitter } from 'events';
import {
  DeviceObd,
  ObdStatus,
  type DtcEntry,
  type PidValue,
  type ObdConfig,
  type DtcCategory,
} from './DeviceObd.js';
import {
  ObdConnectionError,
  ObdTimeoutError,
  ObdParseError,
  ObdUnsupportedError,
} from './errors.js';
import type { Elm327Transport } from '../transports.js';
import { SerialPortTransport } from '../transports.js';
import { DtcParser } from '../parsers/DtcParser.js';
import { PidDatabase } from '../database/PidDatabase.js';

/**
 * Command with priority for queue
 */
interface QueuedCommand {
  command: string;
  priority: number;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  retries: number;
  maxRetries: number;
  timeout: number;
  startTime: number;
}

/**
 * Driver metrics for monitoring
 */
export interface Elm327Metrics {
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  timeouts: number;
  averageLatencyMs: number;
  lastCommand?: string;
  lastDurationMs?: number;
  lastError?: string;
  lastUpdatedAt?: string;
}

/**
 * Command priorities
 */
const PRIORITY_HIGH = 100; // init commands
const PRIORITY_NORMAL = 50; // read commands
const PRIORITY_LOW = 10;  // clear commands

/**
 * Default timeouts per command type (ms)
 */
const DEFAULT_TIMEOUT_AT = 1000;
const DEFAULT_TIMEOUT_MODE_01 = 5000;
const DEFAULT_TIMEOUT_MODE_03 = 5000;
const DEFAULT_TIMEOUT_MODE_04 = 5000;
const DEFAULT_TIMEOUT_MODE_02 = 3000;

/**
 * Retry configuration
 */
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BACKOFF = [500, 1000, 2000]; // ms

/**
 * ELM327 Driver Implementation
 */
export class Elm327Driver extends EventEmitter implements DeviceObd {
  private transport?: Elm327Transport;
  private config: Required<ObdConfig>;
  private status: ObdStatus = ObdStatus.DISCONNECTED;
  private responseBuffer = '';
  private commandQueue: QueuedCommand[] = [];
  private activeCommand?: QueuedCommand;
  private isProcessingQueue = false;
  private pendingResponse?: {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  };
  private supportedPids: Set<string> = new Set();
  private pidDatabase: PidDatabase;
  private metrics: Elm327Metrics = {
    totalCommands: 0,
    successfulCommands: 0,
    failedCommands: 0,
    timeouts: 0,
    averageLatencyMs: 0,
  };
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempt = 0;

  constructor() {
    super();
    this.pidDatabase = new PidDatabase();
    this.config = {
      transport: 'serial',
      port: '',
      baudRate: 38400,
      timeout: 5000,
      retries: DEFAULT_MAX_RETRIES,
      reconnectDelay: 5000,
      reconnectAttempts: 3,
      pidPollRate: 1000,
    };
  }

  /**
   * Initialize adapter
   */
  async init(config: ObdConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    this.updateStatus(ObdStatus.CONNECTING);

    try {
      await this.connect();
      this.updateStatus(ObdStatus.INITIALIZING);
      await this.initializeAdapter();
      this.updateStatus(ObdStatus.READY);
      this.emit('connected');
    } catch (error) {
      this.updateStatus(ObdStatus.ERROR);
      throw new ObdConnectionError(
        `Failed to initialize OBD adapter: ${error instanceof Error ? error.message : String(error)}`,
        { config: this.config }
      );
    }
  }

  /**
   * Read diagnostic trouble codes (Mode 03)
   */
  async readDtc(): Promise<DtcEntry[]> {
    if (this.status !== ObdStatus.READY && this.status !== ObdStatus.IDLE) {
      throw new ObdConnectionError('Adapter not ready', { status: this.status });
    }

    this.updateStatus(ObdStatus.SCANNING);

    try {
      const response = await this.sendCommand('03', PRIORITY_NORMAL, DEFAULT_TIMEOUT_MODE_03);
      const dtcs = this.parseDtcResponse(response);
      this.emit('dtc-read', dtcs);
      return dtcs;
    } catch (error) {
      throw new ObdConnectionError(
        `Failed to read DTC: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.updateStatus(ObdStatus.IDLE);
    }
  }

  /**
   * Clear diagnostic trouble codes (Mode 04)
   */
  async clearDtc(): Promise<boolean> {
    if (this.status !== ObdStatus.READY && this.status !== ObdStatus.IDLE) {
      throw new ObdConnectionError('Adapter not ready', { status: this.status });
    }

    try {
      const response = await this.sendCommand('04', PRIORITY_LOW, DEFAULT_TIMEOUT_MODE_04);
      const success = response.includes('44') || response.includes('OK');

      const timestamp = Date.now();
      console.log(JSON.stringify({
        timestamp: new Date(timestamp).toISOString(),
        level: 'info',
        message: 'DTC cleared',
        context: { success, response },
      }));

      this.emit('dtc-cleared', success);
      return success;
    } catch (error) {
      throw new ObdConnectionError(
        `Failed to clear DTC: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Read PID value (Mode 01)
   */
  async readPid(pid: string): Promise<PidValue> {
    if (this.status !== ObdStatus.READY && this.status !== ObdStatus.IDLE) {
      throw new ObdConnectionError('Adapter not ready', { status: this.status });
    }

    const pidUpper = pid.toUpperCase();

    if (!this.supportedPids.has(pidUpper)) {
      throw new ObdUnsupportedError(`PID ${pidUpper} not supported`, pidUpper);
    }

    try {
      const response = await this.sendCommand(`01${pidUpper}`, PRIORITY_NORMAL, DEFAULT_TIMEOUT_MODE_01);
      const pidValue = this.parsePidResponse(pidUpper, response);
      this.emit('pid-read', pidValue);
      return pidValue;
    } catch (error) {
      throw new ObdConnectionError(
        `Failed to read PID ${pidUpper}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get current status
   */
  getStatus(): ObdStatus {
    return this.status;
  }

  /**
   * Disconnect from adapter
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.transport) {
      try {
        this.transport.offData(this.handleData);
        this.transport.offClose(this.handleClose);
        this.transport.offError(this.handleError);
        await this.transport.close();
      } catch (error) {
        console.error('Error closing transport:', error);
      }
      this.transport = undefined;
    }

    this.updateStatus(ObdStatus.DISCONNECTED);
    this.commandQueue = [];
    this.activeCommand = undefined;
    this.isProcessingQueue = false;
    this.emit('disconnected');
  }

  /**
   * Get current metrics
   */
  getMetrics(): Elm327Metrics {
    return { ...this.metrics };
  }

  /**
   * Connect to transport
   */
  private async connect(): Promise<void> {
    if (process.env.AGENT_ENV === 'DEV' && this.config.port === 'MOCK') {
      const { DevTransport } = await import('./transport/DevTransport.js');
      this.transport = new DevTransport();
      console.log('[Elm327Driver] Using DEV mock transport');
    } else if (this.config.transport === 'serial') {
      this.transport = new SerialPortTransport({
        path: this.config.port,
        baudRate: this.config.baudRate,
      });
    } else {
      throw new ObdUnsupportedError('Bluetooth transport not yet implemented');
    }

    await this.transport.open();
    this.transport.onData(this.handleData);
    this.transport.onClose(this.handleClose);
    this.transport.onError(this.handleError);

    await this.delay(500);
  }

  /**
   * Initialize ELM327 adapter
   */
  private async initializeAdapter(): Promise<void> {
    const initSequence = [
      { cmd: 'ATZ', desc: 'Reset' },
      { cmd: 'ATE0', desc: 'Echo off' },
      { cmd: 'ATL0', desc: 'Linefeeds off' },
      { cmd: 'ATS0', desc: 'Spaces off' },
      { cmd: 'ATH0', desc: 'Headers off' },
      { cmd: 'ATSP0', desc: 'Auto protocol' },
    ];

    for (const { cmd, desc } of initSequence) {
      try {
        await this.sendCommand(cmd, PRIORITY_HIGH, DEFAULT_TIMEOUT_AT);
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'debug',
          message: `Init: ${desc}`,
          context: { command: cmd },
        }));
      } catch (error) {
        throw new ObdConnectionError(
          `Initialization failed at ${desc}`,
          { command: cmd, error: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    await this.delay(1000);

    try {
      const response = await this.sendCommand('0100', PRIORITY_HIGH, DEFAULT_TIMEOUT_MODE_01);
      this.parseSupportedPids(response);
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Adapter initialized',
        context: { supportedPids: Array.from(this.supportedPids) },
      }));
    } catch (error) {
      console.warn('Could not query supported PIDs, continuing anyway');
    }
  }

  /**
   * Send command with priority and retry logic
   */
  private sendCommand(
    command: string,
    priority: number,
    timeout: number,
    retries: number = this.config.retries
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const queuedCommand: QueuedCommand = {
        command,
        priority,
        resolve,
        reject,
        retries: 0,
        maxRetries: retries,
        timeout,
        startTime: Date.now(),
      };

      this.commandQueue.push(queuedCommand);
      this.commandQueue.sort((a, b) => b.priority - a.priority);

      this.processQueue();
    });
  }

  /**
   * Process command queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.activeCommand) {
      return;
    }

    const nextCommand = this.commandQueue.shift();
    if (!nextCommand) {
      return;
    }

    this.isProcessingQueue = true;
    this.activeCommand = nextCommand;

    try {
      const response = await this.executeCommand(nextCommand);
      nextCommand.resolve(response);
      this.activeCommand = undefined;
    } catch (error) {
      if (nextCommand.retries < nextCommand.maxRetries) {
        nextCommand.retries++;
        const backoffDelay = RETRY_BACKOFF[Math.min(nextCommand.retries - 1, RETRY_BACKOFF.length - 1)];

        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'debug',
          message: 'Retrying command',
          context: {
            command: nextCommand.command,
            attempt: nextCommand.retries,
            maxRetries: nextCommand.maxRetries,
            backoffMs: backoffDelay,
          },
        }));

        await this.delay(backoffDelay);
        this.commandQueue.unshift(nextCommand);
        this.activeCommand = undefined;
      } else {
        nextCommand.reject(error as Error);
        this.activeCommand = undefined;
      }
    } finally {
      this.isProcessingQueue = false;
      if (this.commandQueue.length > 0) {
        setImmediate(() => this.processQueue());
      }
    }
  }

  /**
   * Execute single command
   */
  private executeCommand(queuedCommand: QueuedCommand): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.transport) {
        reject(new ObdConnectionError('Transport not connected'));
        return;
      }

      const startTime = Date.now();
      this.metrics.totalCommands++;
      this.metrics.lastCommand = queuedCommand.command;
      this.metrics.lastUpdatedAt = new Date().toISOString();

      const timer = setTimeout(() => {
        this.pendingResponse = undefined;
        this.metrics.timeouts++;
        this.metrics.failedCommands++;
        this.metrics.lastError = 'Timeout';
        this.metrics.lastUpdatedAt = new Date().toISOString();

        const error = new ObdTimeoutError('Command timeout', queuedCommand.command);
        this.emit('timeout', queuedCommand.command);
        reject(error);
      }, queuedCommand.timeout);

      this.pendingResponse = {
        resolve: (response: string) => {
          clearTimeout(timer);
          const duration = Date.now() - startTime;

          this.metrics.successfulCommands++;
          const totalSuccessful = this.metrics.successfulCommands;
          this.metrics.averageLatencyMs =
            ((this.metrics.averageLatencyMs * (totalSuccessful - 1)) + duration) / totalSuccessful;
          this.metrics.lastDurationMs = duration;
          this.metrics.lastError = undefined;
          this.metrics.lastUpdatedAt = new Date().toISOString();

          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'debug',
            message: 'Command executed',
            context: { command: queuedCommand.command, durationMs: duration },
          }));

          resolve(response);
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          const duration = Date.now() - startTime;

          this.metrics.failedCommands++;
          this.metrics.lastDurationMs = duration;
          this.metrics.lastError = error.message;
          this.metrics.lastUpdatedAt = new Date().toISOString();

          reject(error);
        },
        timer,
      };

      this.transport.write(`${queuedCommand.command}\r`).catch((error) => {
        if (this.pendingResponse && this.pendingResponse.timer === timer) {
          this.pendingResponse.reject(error);
          this.pendingResponse = undefined;
        }
      });
    });
  }

  /**
   * Handle incoming data from transport
   */
  private readonly handleData = (chunk: string): void => {
    this.responseBuffer += chunk.replace(/\r/g, '');
    this.tryCompleteResponse();
  };

  /**
   * Try to complete response
   */
  private tryCompleteResponse(): void {
    if (!this.pendingResponse) {
      return;
    }

    const promptIndex = this.responseBuffer.indexOf('>');
    if (promptIndex === -1) {
      return;
    }

    const rawResponse = this.responseBuffer.slice(0, promptIndex);
    this.responseBuffer = this.responseBuffer.slice(promptIndex + 1);

    const sanitized = rawResponse
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    if (this.pendingResponse) {
      this.pendingResponse.resolve(sanitized);
      this.pendingResponse = undefined;
    }
  }

  /**
   * Handle transport close
   */
  private readonly handleClose = (): void => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Transport closed unexpectedly',
      context: { status: this.status },
    }));

    this.updateStatus(ObdStatus.ERROR);
    this.emit('disconnected');
    this.attemptReconnect();
  };

  /**
   * Handle transport error
   */
  private readonly handleError = (error: Error): void => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Transport error',
      context: { error: error.message, status: this.status },
    }));

    this.emit('error', error);
    this.updateStatus(ObdStatus.ERROR);
  };

  /**
   * Attempt reconnection
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempt >= this.config.reconnectAttempts) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Reconnection attempts exhausted',
        context: { attempts: this.reconnectAttempt },
      }));
      this.updateStatus(ObdStatus.UNAVAILABLE);
      return;
    }

    this.reconnectAttempt++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempt - 1); // exponential backoff
    const maxDelay = 60000; // 60 seconds max
    const reconnectDelay = Math.min(delay, maxDelay);

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Attempting reconnection',
      context: { attempt: this.reconnectAttempt, delayMs: reconnectDelay },
    }));

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.init(this.config);
        this.reconnectAttempt = 0;
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Reconnection successful',
          context: {},
        }));
      } catch (error) {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          message: 'Reconnection failed',
          context: { error: error instanceof Error ? error.message : String(error) },
        }));
        this.attemptReconnect();
      }
    }, reconnectDelay);
  }

  /**
   * Update status and emit event
   */
  private updateStatus(newStatus: ObdStatus): void {
    if (this.status !== newStatus) {
      const oldStatus = this.status;
      this.status = newStatus;

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Status changed',
        context: { from: oldStatus, to: newStatus },
      }));

      this.emit('status-change', newStatus);
    }
  }

  /**
   * Parse DTC response
   */
  private parseDtcResponse(response: string): DtcEntry[] {
    try {
      const dtcCodes = DtcParser.parseDtcResponse(response);
      return dtcCodes.map((dtc) => ({
        code: dtc.code,
        category: dtc.code[0] as DtcCategory,
        description: dtc.description,
        rawBytes: response,
      }));
    } catch (error) {
      throw new ObdParseError('Failed to parse DTC response', response, error instanceof Error ? { message: error.message, stack: error.stack } : { error: String(error) });
    }
  }

  /**
   * Parse PID response
   */
  private parsePidResponse(pid: string, response: string): PidValue {
    try {
      const hex = response.split(/\s+/).filter((x) => /^[0-9A-Fa-f]{2}$/i.test(x));

      let dataStartIndex = -1;
      for (let i = 0; i < hex.length - 1; i++) {
        if (hex[i] === '41' && hex[i + 1].toUpperCase() === pid) {
          dataStartIndex = i + 2;
          break;
        }
      }

      if (dataStartIndex === -1) {
        throw new Error('PID response not found in data');
      }

      const pidDef = this.pidDatabase.getPidByModeAndPid('01', pid);
      if (!pidDef) {
        throw new Error(`PID ${pid} not found in database`);
      }

      const dataBytes = hex.slice(dataStartIndex, dataStartIndex + pidDef.bytes);
      const hexString = dataBytes.join('');
      const value = pidDef.convertToUseful(hexString);

      return {
        pid,
        value,
        unit: pidDef.unit,
        rawBytes: hexString,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new ObdParseError(`Failed to parse PID ${pid} response`, response, error instanceof Error ? { message: error.message, stack: error.stack } : { error: String(error) });
    }
  }

  /**
   * Parse supported PIDs from 0100 response
   */
  private parseSupportedPids(response: string): void {
    try {
      const hex = response.split(/\s+/).filter((x) => /^[0-9A-Fa-f]{2}$/i.test(x));

      let dataStartIndex = -1;
      for (let i = 0; i < hex.length - 1; i++) {
        if (hex[i] === '41' && hex[i + 1] === '00') {
          dataStartIndex = i + 2;
          break;
        }
      }

      if (dataStartIndex === -1) {
        return;
      }

      const dataBytes = hex.slice(dataStartIndex, dataStartIndex + 4);
      if (dataBytes.length !== 4) {
        return;
      }

      const bitmap = parseInt(dataBytes.join(''), 16);

      for (let i = 0; i < 32; i++) {
        if (bitmap & (1 << (31 - i))) {
          const pidNum = (i + 1).toString(16).toUpperCase().padStart(2, '0');
          this.supportedPids.add(pidNum);
        }
      }
    } catch (error) {
      console.warn('Failed to parse supported PIDs:', error);
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
