/**
 * Mock-драйвер замка для тестов и DEV-режима
 */
export class MockLockDriver {
    constructor(config) {
        this.status = 'locked';
        this.config = config ?? {};
    }
    async open() {
        if (this.config.failOnOpen) {
            this.status = 'error';
            throw new Error('Mock lock: open failed');
        }
        if (this.config.openDelayMs) {
            await this.delay(this.config.openDelayMs);
        }
        this.status = 'unlocked';
    }
    async close() {
        if (this.config.failOnClose) {
            this.status = 'error';
            throw new Error('Mock lock: close failed');
        }
        if (this.config.closeDelayMs) {
            await this.delay(this.config.closeDelayMs);
        }
        this.status = 'locked';
    }
    async getStatus() {
        return this.status;
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
