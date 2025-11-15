/**
 * Mock-драйвер замка для тестов и DEV-режима
 */

import type { Lock, LockStatus } from './types.js';

export interface MockLockDriverConfig {
  failOnOpen?: boolean;
  failOnClose?: boolean;
  openDelayMs?: number;
  closeDelayMs?: number;
}

export class MockLockDriver implements Lock {
  private status: LockStatus = 'locked';
  private readonly config: MockLockDriverConfig;

  constructor(config?: MockLockDriverConfig) {
    this.config = config ?? {};
  }

  async open(): Promise<void> {
    if (this.config.failOnOpen) {
      this.status = 'error';
      throw new Error('Mock lock: open failed');
    }

    if (this.config.openDelayMs) {
      await this.delay(this.config.openDelayMs);
    }

    this.status = 'unlocked';
  }

  async close(): Promise<void> {
    if (this.config.failOnClose) {
      this.status = 'error';
      throw new Error('Mock lock: close failed');
    }

    if (this.config.closeDelayMs) {
      await this.delay(this.config.closeDelayMs);
    }

    this.status = 'locked';
  }

  async getStatus(): Promise<LockStatus> {
    return this.status;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
