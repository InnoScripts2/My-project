/**
 * DEV Mock Transport
 * Simulates ELM327 responses for testing without real hardware
 * Only available in DEV mode (AGENT_ENV=DEV)
 */

import { EventEmitter } from 'events';
import type { Elm327Transport } from '../../transports.js';

/**
 * Mock responses for common commands
 */
const MOCK_RESPONSES: Record<string, string> = {
  'ATZ': 'ELM327 v1.5',
  'ATE0': 'OK',
  'ATL0': 'OK',
  'ATS0': 'OK',
  'ATH0': 'OK',
  'ATH1': 'OK',
  'ATSP0': 'OK',
  'ATSP6': 'OK',
  'ATI': 'ELM327 v1.5',

  '0100': '41 00 BE 3E B8 13',
  '0120': '41 20 80 00 00 01',
  '0140': '41 40 FE D0 00 00',
  '0160': '41 60 00 00 00 01',

  '010C': '41 0C 1A F8',
  '010D': '41 0D 50',
  '0105': '41 05 64',
  '010F': '41 0F 50',
  '0111': '41 11 80',
  '0142': '41 42 30 39',
  '0104': '41 04 7F',
  '010A': '41 0A C8',
  '010B': '41 0B 65',
  '0110': '41 10 1A F8',

  '03': '43 01 33 00 44 00 00 00',
  '04': '44 00 00 00 00 00 00 00',

  '0900': '49 00 55 40 00 00 00 00',
  '0902': '49 02 01 31 47 31 4A 43 35 34 34 34 52 37 32 35 32 33 36 37',
};

/**
 * Mock Transport for DEV testing
 */
export class DevTransport extends EventEmitter implements Elm327Transport {
  private isOpen = false;
  private responseDelay = 100; // ms
  private simulateErrors = false;
  private errorRate = 0.05; // 5% error rate
  private dataListener?: (chunk: string) => void;

  constructor(options?: {
    responseDelay?: number;
    simulateErrors?: boolean;
    errorRate?: number;
  }) {
    super();

    if (process.env.AGENT_ENV !== 'DEV') {
      throw new Error('DevTransport can only be used in DEV mode');
    }

    if (options) {
      this.responseDelay = options.responseDelay ?? this.responseDelay;
      this.simulateErrors = options.simulateErrors ?? this.simulateErrors;
      this.errorRate = options.errorRate ?? this.errorRate;
    }
  }

  async open(): Promise<void> {
    if (this.isOpen) {
      return;
    }

    await this.delay(50);

    this.isOpen = true;
    console.log('[DevTransport] Mock connection opened');
  }

  async close(): Promise<void> {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;
    console.log('[DevTransport] Mock connection closed');
    this.emit('close');
  }

  async write(data: string): Promise<void> {
    if (!this.isOpen) {
      throw new Error('Transport not open');
    }

    const command = data.replace(/\r/g, '').trim().toUpperCase();

    if (this.simulateErrors && Math.random() < this.errorRate) {
      this.emit('error', new Error('Simulated transport error'));
      return;
    }

    await this.delay(this.responseDelay);

    const response = this.getMockResponse(command);
    const fullResponse = `${response}\n>`;

    if (this.dataListener) {
      this.dataListener(fullResponse);
    } else {
      this.emit('data', fullResponse);
    }
  }

  onData(listener: (chunk: string) => void): void {
    this.dataListener = listener;
    this.on('data', listener);
  }

  offData(listener: (chunk: string) => void): void {
    if (this.dataListener === listener) {
      this.dataListener = undefined;
    }
    this.off('data', listener);
  }

  onClose(listener: () => void): void {
    this.on('close', listener);
  }

  offClose(listener: () => void): void {
    this.off('close', listener);
  }

  onError(listener: (error: Error) => void): void {
    this.on('error', listener);
  }

  offError(listener: (error: Error) => void): void {
    this.off('error', listener);
  }

  /**
   * Get mock response for command
   */
  private getMockResponse(command: string): string {
    if (MOCK_RESPONSES[command]) {
      return MOCK_RESPONSES[command];
    }

    if (command.startsWith('01')) {
      return 'NO DATA';
    }

    if (command.startsWith('09')) {
      return 'NO DATA';
    }

    return 'ERROR';
  }

  /**
   * Simulate network delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Set specific response for command (for testing)
   */
  setMockResponse(command: string, response: string): void {
    MOCK_RESPONSES[command.toUpperCase()] = response;
  }

  /**
   * Simulate connection loss
   */
  simulateDisconnect(): void {
    if (this.isOpen) {
      this.isOpen = false;
      this.emit('close');
    }
  }

  /**
   * Simulate error
   */
  simulateError(errorMessage: string): void {
    this.emit('error', new Error(errorMessage));
  }
}
