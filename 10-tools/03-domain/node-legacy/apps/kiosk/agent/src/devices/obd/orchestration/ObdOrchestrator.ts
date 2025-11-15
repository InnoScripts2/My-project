/**
 * OBD Orchestrator
 * Manages OBD diagnostic sessions with state machine and event handling
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type { DeviceObd } from '../driver/DeviceObd.js';
import {
  DiagnosticSession,
  SessionStatus,
  PidSnapshot,
  InMemorySessionStore,
  type SessionStore,
} from './Session.js';
import { ObdSessionError, ObdStateError } from './errors.js';
import { readFileSync } from 'fs';
import { join } from 'path';

export enum OrchestratorState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  SCANNING = 'SCANNING',
  RESULTS_READY = 'RESULTS_READY',
  IDLE = 'IDLE',
  ERROR = 'ERROR',
}

export interface OrchestratorConfig {
  scanTimeout: number;
  pidPollInterval: number;
  pidPollDuration: number;
  sessionTTL: number;
  supportedPids: string[];
  maxConcurrentSessions: number;
}

export interface OrchestratorStatus {
  currentStatus: OrchestratorState;
  sessionId?: string;
  progress: number;
  message: string;
}

interface OrchestratorEvents {
  'session-started': (sessionId: string) => void;
  'scan-progress': (progress: number, message: string) => void;
  'scan-complete': (sessionId: string) => void;
  'dtc-cleared': (sessionId: string, success: boolean) => void;
  disconnected: () => void;
  error: (error: Error) => void;
}

export declare interface ObdOrchestrator {
  on<K extends keyof OrchestratorEvents>(event: K, listener: OrchestratorEvents[K]): this;
  emit<K extends keyof OrchestratorEvents>(event: K, ...args: Parameters<OrchestratorEvents[K]>): boolean;
}

export class ObdOrchestrator extends EventEmitter {
  private driver: DeviceObd;
  private state: OrchestratorState = OrchestratorState.DISCONNECTED;
  private currentSessionId?: string;
  private sessionStore: SessionStore;
  private config: OrchestratorConfig;
  private scanTimeoutTimer?: NodeJS.Timeout;
  private progress: number = 0;
  private activeSessions: Set<string> = new Set();

  constructor(driver: DeviceObd, configPath?: string) {
    super();
    this.driver = driver;
    this.sessionStore = new InMemorySessionStore();
    
    const defaultConfig: OrchestratorConfig = {
      scanTimeout: 120000,
      pidPollInterval: 500,
      pidPollDuration: 10000,
      sessionTTL: 3600000,
      supportedPids: ['0C', '0D', '05', '0F', '11'],
      maxConcurrentSessions: 1,
    };

    if (configPath) {
      try {
        const configData = readFileSync(configPath, 'utf-8');
        this.config = { ...defaultConfig, ...JSON.parse(configData) };
      } catch (error) {
        console.error('Failed to load config, using defaults:', error);
        this.config = defaultConfig;
      }
    } else {
      this.config = defaultConfig;
    }

    this.setupDriverListeners();
  }

  private setupDriverListeners(): void {
    this.driver.on('connected', () => {
      if (this.state === OrchestratorState.CONNECTING) {
        this.transitionTo(OrchestratorState.CONNECTED);
      }
    });

    this.driver.on('disconnected', () => {
      this.transitionTo(OrchestratorState.DISCONNECTED);
      this.emit('disconnected');
    });

    this.driver.on('error', (error: Error) => {
      this.transitionTo(OrchestratorState.ERROR);
      this.emit('error', error);
      this.log('error', 'Driver error', { error: error.message });
    });
  }

  private transitionTo(newState: OrchestratorState): void {
    this.log('info', 'State transition', { from: this.state, to: newState });
    this.state = newState;
  }

  private log(level: string, message: string, context?: Record<string, unknown>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'kiosk-agent',
      component: 'ObdOrchestrator',
      environment: process.env.AGENT_ENV || 'DEV',
      sessionId: this.currentSessionId,
      ...context,
    };
    console.log(JSON.stringify(logEntry));
  }

  async connect(): Promise<void> {
    if (this.state === OrchestratorState.CONNECTED || this.state === OrchestratorState.IDLE) {
      return;
    }

    this.transitionTo(OrchestratorState.CONNECTING);
    
    try {
      await this.driver.init({
        transport: 'serial',
        port: process.env.OBD_PORT || '/dev/ttyUSB0',
        baudRate: 38400,
        timeout: 5000,
        retries: 3,
      });
      
      this.transitionTo(OrchestratorState.CONNECTED);
      this.log('info', 'Driver connected successfully');
    } catch (error) {
      this.transitionTo(OrchestratorState.ERROR);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', 'Connection failed', { error: errorMessage });
      throw new ObdSessionError('Connection failed', 'connection_failed', undefined, { error: errorMessage });
    }
  }

  async startScan(metadata?: { vehicleMake?: string; vehicleModel?: string }): Promise<string> {
    if (this.state !== OrchestratorState.CONNECTED && this.state !== OrchestratorState.IDLE) {
      throw new ObdStateError(
        'Cannot start scan in current state',
        'invalid_state',
        this.state,
        'startScan'
      );
    }

    if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
      throw new ObdSessionError(
        'Maximum concurrent sessions reached',
        'max_sessions_reached',
        undefined,
        { maxSessions: this.config.maxConcurrentSessions }
      );
    }

    const sessionId = randomUUID();
    this.currentSessionId = sessionId;
    this.activeSessions.add(sessionId);

    const session: DiagnosticSession = {
      sessionId,
      startTime: Date.now(),
      status: SessionStatus.IN_PROGRESS,
      dtcList: [],
      pidSnapshots: [],
      metadata,
    };

    this.sessionStore.set(sessionId, session);
    this.transitionTo(OrchestratorState.SCANNING);
    this.progress = 0;
    this.emit('session-started', sessionId);
    this.log('info', 'Scan started', { sessionId, metadata });

    this.scanTimeoutTimer = setTimeout(() => {
      this.handleScanTimeout(sessionId);
    }, this.config.scanTimeout);

    this.runScanSequence(sessionId).catch((error) => {
      this.handleScanError(sessionId, error);
    });

    return sessionId;
  }

  private async runScanSequence(sessionId: string): Promise<void> {
    try {
      this.progress = 10;
      this.emit('scan-progress', this.progress, 'Reading diagnostic trouble codes');
      
      const dtcList = await this.driver.readDtc();
      
      const session = this.sessionStore.get(sessionId);
      if (session) {
        session.dtcList = dtcList;
        this.sessionStore.set(sessionId, session);
      }

      this.progress = 50;
      this.emit('scan-progress', this.progress, 'Reading PID values');

      const pidSnapshots = await this.collectPidSnapshots();
      
      const updatedSession = this.sessionStore.get(sessionId);
      if (updatedSession) {
        updatedSession.pidSnapshots = pidSnapshots;
        updatedSession.endTime = Date.now();
        updatedSession.status = SessionStatus.COMPLETED;
        this.sessionStore.set(sessionId, updatedSession);
      }

      this.progress = 100;
      this.emit('scan-progress', this.progress, 'Scan complete');
      
      if (this.scanTimeoutTimer) {
        clearTimeout(this.scanTimeoutTimer);
      }

      this.transitionTo(OrchestratorState.RESULTS_READY);
      this.emit('scan-complete', sessionId);
      this.log('info', 'Scan completed', { sessionId, dtcCount: dtcList.length, pidCount: pidSnapshots.length });
    } catch (error) {
      throw error;
    }
  }

  private async collectPidSnapshots(): Promise<PidSnapshot[]> {
    const snapshots: PidSnapshot[] = [];
    const pollCount = Math.floor(this.config.pidPollDuration / this.config.pidPollInterval);
    
    for (let i = 0; i < pollCount; i++) {
      try {
        const snapshot: PidSnapshot = {
          timestamp: Date.now(),
        };

        for (const pid of this.config.supportedPids) {
          try {
            const value = await this.driver.readPid(pid);
            switch (pid) {
              case '0C':
                snapshot.rpm = value.value;
                break;
              case '0D':
                snapshot.speed = value.value;
                break;
              case '05':
                snapshot.coolantTemp = value.value;
                break;
              case '0F':
                snapshot.intakeTemp = value.value;
                break;
              case '11':
                snapshot.throttle = value.value;
                break;
            }
          } catch (error) {
            this.log('debug', 'Failed to read PID', { pid, error: error instanceof Error ? error.message : String(error) });
          }
        }

        snapshots.push(snapshot);

        const currentProgress = 50 + (i / pollCount) * 50;
        if (Math.floor(currentProgress) !== Math.floor(this.progress)) {
          this.progress = Math.floor(currentProgress);
          this.emit('scan-progress', this.progress, `Collecting PID data (${i + 1}/${pollCount})`);
        }

        await new Promise(resolve => setTimeout(resolve, this.config.pidPollInterval));
      } catch (error) {
        this.log('debug', 'Error collecting snapshot', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    return snapshots;
  }

  private handleScanTimeout(sessionId: string): void {
    const session = this.sessionStore.get(sessionId);
    if (session && session.status === SessionStatus.IN_PROGRESS) {
      session.status = SessionStatus.TIMEOUT;
      session.endTime = Date.now();
      this.sessionStore.set(sessionId, session);
      
      this.transitionTo(OrchestratorState.RESULTS_READY);
      this.emit('scan-complete', sessionId);
      this.log('warn', 'Scan timeout', { sessionId });
    }
  }

  private handleScanError(sessionId: string, error: unknown): void {
    const session = this.sessionStore.get(sessionId);
    if (session) {
      session.status = SessionStatus.FAILED;
      session.endTime = Date.now();
      this.sessionStore.set(sessionId, session);
    }

    if (this.scanTimeoutTimer) {
      clearTimeout(this.scanTimeoutTimer);
    }

    this.transitionTo(OrchestratorState.ERROR);
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.emit('error', error instanceof Error ? error : new Error(errorMessage));
    this.log('error', 'Scan failed', { sessionId, error: errorMessage });
  }

  getStatus(): OrchestratorStatus {
    let message = '';
    
    switch (this.state) {
      case OrchestratorState.DISCONNECTED:
        message = 'Disconnected';
        break;
      case OrchestratorState.CONNECTING:
        message = 'Connecting to adapter';
        break;
      case OrchestratorState.CONNECTED:
        message = 'Connected, ready to scan';
        break;
      case OrchestratorState.SCANNING:
        if (this.progress < 50) {
          message = 'Scanning DTC codes';
        } else {
          message = 'Reading PIDs';
        }
        break;
      case OrchestratorState.RESULTS_READY:
        message = 'Scan complete';
        break;
      case OrchestratorState.IDLE:
        message = 'Idle';
        break;
      case OrchestratorState.ERROR:
        message = 'Error occurred';
        break;
    }

    return {
      currentStatus: this.state,
      sessionId: this.currentSessionId,
      progress: this.progress,
      message,
    };
  }

  getScanResults(sessionId: string): DiagnosticSession | undefined {
    return this.sessionStore.get(sessionId);
  }

  async clearDtc(confirm: boolean): Promise<boolean> {
    if (confirm !== true) {
      throw new ObdSessionError(
        'Confirmation required to clear DTC',
        'confirmation_required'
      );
    }

    if (this.state !== OrchestratorState.RESULTS_READY && this.state !== OrchestratorState.IDLE) {
      throw new ObdStateError(
        'Cannot clear DTC in current state',
        'invalid_state',
        this.state,
        'clearDtc'
      );
    }

    try {
      const success = await this.driver.clearDtc();
      
      if (this.currentSessionId) {
        const session = this.sessionStore.get(this.currentSessionId);
        if (session) {
          session.dtcClearedAt = Date.now();
          session.dtcClearResult = success;
          this.sessionStore.set(this.currentSessionId, session);
        }
      }

      this.transitionTo(OrchestratorState.IDLE);
      this.emit('dtc-cleared', this.currentSessionId || '', success);
      this.log('info', 'DTC cleared', { sessionId: this.currentSessionId, success });
      
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', 'Failed to clear DTC', { sessionId: this.currentSessionId, error: errorMessage });
      throw new ObdSessionError('Failed to clear DTC', 'clear_dtc_failed', this.currentSessionId, { error: errorMessage });
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.driver.disconnect();
      
      if (this.scanTimeoutTimer) {
        clearTimeout(this.scanTimeoutTimer);
      }

      if (this.currentSessionId) {
        this.activeSessions.delete(this.currentSessionId);
        this.currentSessionId = undefined;
      }

      this.transitionTo(OrchestratorState.DISCONNECTED);
      this.emit('disconnected');
      this.log('info', 'Disconnected');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', 'Disconnect failed', { error: errorMessage });
      throw new ObdSessionError('Disconnect failed', 'disconnect_failed', undefined, { error: errorMessage });
    }
  }
}
