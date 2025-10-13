/**
 * Bluetooth OBD Driver
 * Implements OBD-II communication over Bluetooth Serial Port (SPP)
 * Uses ELM327 protocol
 */

import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import type { ObdDriver } from './ObdDriverInterface.js';
import type { ObdMode, PidIdentifier, DtcCode } from '../database/types.js';
import { INIT_SEQUENCE, REQUEST_MODE_03, REQUEST_MODE_04, buildObdRequest } from '../commands/Elm327Commands.js';
import { Elm327Parser } from '../parsers/Elm327Parser.js';
import { DtcParser } from '../parsers/DtcParser.js';

/**
 * Configuration for Bluetooth OBD driver
 */
export interface BluetoothObdConfig {
  portPath: string;
  baudRate?: number;
}

/**
 * Command queue item
 */
interface CommandQueueItem {
  command: string;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
  timeoutId?: NodeJS.Timeout;
}

/**
 * Custom errors
 */
export class ObdConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObdConnectionError';
  }
}

export class ObdTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObdTimeoutError';
  }
}

export class ObdCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObdCommandError';
  }
}

/**
 * Bluetooth Serial Port OBD Driver
 * Implements ELM327 protocol over Bluetooth SPP
 */
export class BluetoothObdDriver extends EventEmitter implements ObdDriver {
  private serialPort: SerialPort | null = null;
  private connected: boolean = false;
  private responseBuffer: string = '';
  private commandQueue: CommandQueueItem[] = [];
  private processing: boolean = false;
  private readonly portPath: string;
  private readonly baudRate: number;
  private readonly commandTimeout: number = 5000;

  constructor(config: BluetoothObdConfig) {
    super();
    this.portPath = config.portPath;
    this.baudRate = config.baudRate ?? 38400;
  }

  /**
   * Connect to OBD adapter and initialize ELM327
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Create serial port
      this.serialPort = new SerialPort({
        path: this.portPath,
        baudRate: this.baudRate,
        autoOpen: false,
      });

      // Setup event handlers
      this.serialPort.on('data', (data: Buffer) => this.handleData(data.toString()));
      this.serialPort.on('error', (error: Error) => this.handleError(error));
      this.serialPort.on('close', () => this.handleClose());

      // Open port
      await new Promise<void>((resolve, reject) => {
        if (!this.serialPort) {
          reject(new ObdConnectionError('Serial port not initialized'));
          return;
        }

        this.serialPort.open((error) => {
          if (error) {
            reject(new ObdConnectionError(`Failed to open port: ${error.message}`));
          } else {
            resolve();
          }
        });
      });

      // Initialize ELM327
      await this.initializeElm327();

      this.connected = true;
      this.emit('connected', { timestamp: new Date() });
    } catch (error) {
      // Cleanup on failure
      if (this.serialPort?.isOpen) {
        this.serialPort.close();
      }
      this.serialPort = null;
      throw error;
    }
  }

  /**
   * Disconnect from OBD adapter
   */
  async disconnect(): Promise<void> {
    if (!this.serialPort) {
      this.connected = false;
      return;
    }

    return new Promise<void>((resolve) => {
      if (!this.serialPort) {
        this.connected = false;
        resolve();
        return;
      }

      this.serialPort.close((error) => {
        if (error) {
          this.emit('error', { error, timestamp: new Date() });
        }
        this.serialPort = null;
        this.connected = false;
        this.commandQueue = [];
        this.emit('disconnected', { timestamp: new Date() });
        resolve();
      });
    });
  }

  /**
   * Check if adapter is connected
   */
  isConnected(): boolean {
    return this.connected && this.serialPort?.isOpen === true;
  }

  /**
   * Send raw command to adapter
   */
  async sendCommand(command: string): Promise<string> {
    if (!this.isConnected()) {
      throw new ObdConnectionError('OBD adapter is not connected');
    }

    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.commandQueue.findIndex((item) => item.resolve === resolve);
        if (index !== -1) {
          this.commandQueue.splice(index, 1);
        }
        reject(new ObdTimeoutError(`Command timeout: ${command}`));
      }, this.commandTimeout);

      this.commandQueue.push({
        command,
        resolve,
        reject,
        timeoutId,
      });

      if (!this.processing) {
        void this.processQueue();
      }
    });
  }

  /**
   * Request PID data
   */
  async requestPid(mode: ObdMode, pid: PidIdentifier): Promise<string> {
    const command = buildObdRequest(mode, pid);
    const response = await this.sendCommand(command);
    return Elm327Parser.extractDataBytes(response, mode, pid);
  }

  /**
   * Request diagnostic trouble codes
   */
  async requestDtc(): Promise<DtcCode[]> {
    const response = await this.sendCommand(REQUEST_MODE_03);
    return DtcParser.parseDtcResponse(response);
  }

  /**
   * Clear diagnostic trouble codes
   */
  async clearDtc(): Promise<void> {
    const response = await this.sendCommand(REQUEST_MODE_04);
    const cleaned = Elm327Parser.parseResponse(response);
    
    // Check for confirmation (44 response)
    if (!cleaned.includes('44')) {
      throw new ObdCommandError('Failed to clear DTC codes');
    }
  }

  /**
   * Initialize ELM327 adapter
   */
  private async initializeElm327(): Promise<void> {
    for (const command of INIT_SEQUENCE) {
      const response = await this.sendCommand(command);
      const cleaned = Elm327Parser.parseResponse(response);
      
      // Check for OK or ELM327 in response
      if (!cleaned.includes('OK') && !cleaned.includes('ELM327')) {
        throw new ObdConnectionError(`ELM327 initialization failed at command: ${command}`);
      }
    }
  }

  /**
   * Process command queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.commandQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.commandQueue.length > 0) {
      const item = this.commandQueue[0];
      
      try {
        // Clear response buffer
        this.responseBuffer = '';

        // Send command
        await this.writeToPort(item.command + '\r');

        // Wait for response (handled in handleData)
        // Response will be processed by handleData event
        // which will resolve the promise
      } catch (error) {
        // Remove from queue and reject
        this.commandQueue.shift();
        if (item.timeoutId) {
          clearTimeout(item.timeoutId);
        }
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.processing = false;
  }

  /**
   * Write data to serial port
   */
  private writeToPort(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.serialPort || !this.serialPort.isOpen) {
        reject(new ObdConnectionError('Serial port is not open'));
        return;
      }

      this.serialPort.write(data, (error) => {
        if (error) {
          reject(new ObdConnectionError(`Failed to write to port: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming data from serial port
   */
  private handleData(data: string): void {
    this.responseBuffer += data;

    // Check if we have a complete response (ends with '>')
    if (this.responseBuffer.includes('>')) {
      const response = this.responseBuffer.substring(0, this.responseBuffer.indexOf('>'));
      this.responseBuffer = this.responseBuffer.substring(this.responseBuffer.indexOf('>') + 1);

      // Process response for current command
      if (this.commandQueue.length > 0) {
        const item = this.commandQueue.shift();
        if (item) {
          if (item.timeoutId) {
            clearTimeout(item.timeoutId);
          }
          item.resolve(response);
          
          // Continue processing queue
          if (this.commandQueue.length > 0) {
            void this.processQueue();
          } else {
            this.processing = false;
          }
        }
      }
    }
  }

  /**
   * Handle serial port close
   */
  private handleClose(): void {
    this.connected = false;
    this.emit('disconnected', { timestamp: new Date(), reason: 'port_closed' });
    
    // Reject all pending commands
    for (const item of this.commandQueue) {
      if (item.timeoutId) {
        clearTimeout(item.timeoutId);
      }
      item.reject(new ObdConnectionError('Connection closed'));
    }
    this.commandQueue = [];
  }

  /**
   * Handle serial port error
   */
  private handleError(error: Error): void {
    this.emit('error', { error, timestamp: new Date() });
  }
}
