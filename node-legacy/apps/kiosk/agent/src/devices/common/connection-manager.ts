/**
 * Connection state machine manager for device drivers
 * Implements production-grade connection lifecycle with reconnection logic
 */

import { EventEmitter } from 'events';
import { createLogger } from './logger.js';
import { getDeviceStorage } from './storage.js';
import { retryWithPolicy, RetryPolicyOptions, DEFAULT_RETRY_POLICY } from './retry.js';
import {
  DeviceConnectionError,
  DeviceTimeoutError,
  DeviceNotFoundError,
} from './errors.js';

const logger = createLogger('ConnectionManager');
const storage = getDeviceStorage();

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  INITIALIZING = 'initializing',
  READY = 'ready',
  ERROR = 'error',
  BACKOFF = 'backoff',
  RECONNECTING = 'reconnecting',
}

export interface ConnectionManagerConfig {
  deviceType: 'obd' | 'thickness';
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  retryPolicy?: RetryPolicyOptions;
  healthCheckInterval?: number;
}

export interface ConnectionTransition {
  from: ConnectionState;
  to: ConnectionState;
  timestamp: Date;
  reason?: string;
  error?: Error;
}

export class ConnectionManager extends EventEmitter {
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private config: Required<ConnectionManagerConfig>;
  private transitions: ConnectionTransition[] = [];
  private reconnectAttempts: number = 0;
  private connectionId: string | null = null;
  private connectionStartTime: Date | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: ConnectionManagerConfig) {
    super();
    this.config = {
      deviceType: config.deviceType,
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      retryPolicy: config.retryPolicy ?? DEFAULT_RETRY_POLICY,
      healthCheckInterval: config.healthCheckInterval ?? 30000,
    };
  }

  getState(): ConnectionState {
    return this.state;
  }

  getTransitions(): ConnectionTransition[] {
    return [...this.transitions];
  }

  getConnectionId(): string | null {
    return this.connectionId;
  }

  private transitionTo(newState: ConnectionState, reason?: string, error?: Error): void {
    const oldState = this.state;
    if (oldState === newState) return;

    const transition: ConnectionTransition = {
      from: oldState,
      to: newState,
      timestamp: new Date(),
      reason,
      error,
    };

    this.transitions.push(transition);
    this.state = newState;

    logger.info(`State transition: ${oldState} -> ${newState}`, {
      reason,
      error: error?.message,
    });

    storage.recordEvent({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      deviceType: this.config.deviceType,
      eventType: 'reconnect_attempt',
      state: newState,
      previousState: oldState,
      error: error?.message,
      metadata: JSON.stringify({ reason, attempt: this.reconnectAttempts }),
    });

    this.emit('state_changed', newState, oldState, transition);
  }

  async connect(
    connectFn: () => Promise<void>,
    initFn: () => Promise<void>
  ): Promise<void> {
    if (this.state !== ConnectionState.DISCONNECTED && this.state !== ConnectionState.ERROR) {
      throw new Error(`Cannot connect from state ${this.state}`);
    }

    this.connectionId = crypto.randomUUID();
    this.connectionStartTime = new Date();
    this.reconnectAttempts = 0;

    try {
      this.transitionTo(ConnectionState.CONNECTING, 'Starting connection');

      await retryWithPolicy(
        async (attempt) => {
          logger.info(`Connection attempt ${attempt}/${this.config.retryPolicy.maxAttempts}`);
          await connectFn();
        },
        this.config.retryPolicy,
        (attempt, delayMs) => {
          if (attempt > 1) {
            this.transitionTo(
              ConnectionState.BACKOFF,
              `Retrying in ${delayMs}ms`,
              undefined
            );
          }
        },
        (attempt, error) => {
          logger.warn(`Connection attempt ${attempt} failed`, { error });
        }
      );

      this.transitionTo(ConnectionState.INITIALIZING, 'Connection established, initializing');

      await retryWithPolicy(
        async () => {
          await initFn();
        },
        this.config.retryPolicy
      );

      this.transitionTo(ConnectionState.READY, 'Device ready');

      storage.saveState({
        deviceType: this.config.deviceType,
        state: 'connected',
        connected: true,
        lastConnected: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      this.startHealthCheck();
      this.emit('connected');
    } catch (error) {
      this.transitionTo(ConnectionState.ERROR, 'Connection failed', error as Error);
      
      storage.saveState({
        deviceType: this.config.deviceType,
        state: 'error',
        connected: false,
        lastError: (error as Error).message,
        updatedAt: new Date().toISOString(),
      });

      if (this.connectionId && this.connectionStartTime) {
        storage.recordConnectionSession({
          id: this.connectionId,
          deviceType: this.config.deviceType,
          startedAt: this.connectionStartTime.toISOString(),
          endedAt: new Date().toISOString(),
          durationMs: Date.now() - this.connectionStartTime.getTime(),
          stateTransitions: JSON.stringify(this.transitions),
          success: false,
          error: (error as Error).message,
        });
      }

      this.emit('error', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.stopHealthCheck();

    if (this.connectionId && this.connectionStartTime) {
      storage.recordConnectionSession({
        id: this.connectionId,
        deviceType: this.config.deviceType,
        startedAt: this.connectionStartTime.toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - this.connectionStartTime.getTime(),
        stateTransitions: JSON.stringify(this.transitions),
        success: this.state === ConnectionState.READY,
      });
    }

    this.transitionTo(ConnectionState.DISCONNECTED, 'Disconnecting');

    storage.saveState({
      deviceType: this.config.deviceType,
      state: 'disconnected',
      connected: false,
      updatedAt: new Date().toISOString(),
    });

    this.connectionId = null;
    this.connectionStartTime = null;
    this.reconnectAttempts = 0;
    this.transitions = [];

    this.emit('disconnected');
  }

  async handleConnectionLoss(
    disconnectFn: () => Promise<void>,
    connectFn: () => Promise<void>,
    initFn: () => Promise<void>
  ): Promise<void> {
    if (!this.config.autoReconnect) {
      logger.warn('Auto-reconnect disabled, not attempting reconnection');
      this.transitionTo(ConnectionState.DISCONNECTED, 'Connection lost');
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached', {
        attempts: this.reconnectAttempts,
      });
      this.transitionTo(ConnectionState.ERROR, 'Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    this.transitionTo(
      ConnectionState.RECONNECTING,
      `Reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`
    );

    try {
      await disconnectFn();
    } catch (error) {
      logger.warn('Disconnect during reconnection failed', { error });
    }

    try {
      await this.connect(connectFn, initFn);
      this.reconnectAttempts = 0;
      logger.info('Reconnection successful');
    } catch (error) {
      logger.error('Reconnection failed', { error });
      await this.handleConnectionLoss(disconnectFn, connectFn, initFn);
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(() => {
      this.emit('health_check_requested');
    }, this.config.healthCheckInterval);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  getHealthStatus() {
    const recentTransitions = this.transitions.slice(-10);
    const errorTransitions = recentTransitions.filter((t) => t.to === ConnectionState.ERROR);

    return {
      state: this.state,
      connected: this.state === ConnectionState.READY,
      connectionId: this.connectionId,
      reconnectAttempts: this.reconnectAttempts,
      uptime: this.connectionStartTime
        ? Date.now() - this.connectionStartTime.getTime()
        : 0,
      recentTransitions: recentTransitions.length,
      errorRate:
        recentTransitions.length > 0
          ? errorTransitions.length / recentTransitions.length
          : 0,
    };
  }
}
