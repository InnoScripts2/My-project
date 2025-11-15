/**
 * OBD Diagnostic Session
 * Data structures for managing diagnostic sessions
 */

import type { DtcEntry, PidValue } from '../driver/DeviceObd.js';

export enum SessionStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
}

export interface PidSnapshot {
  timestamp: number;
  rpm?: number;
  speed?: number;
  coolantTemp?: number;
  intakeTemp?: number;
  throttle?: number;
}

export interface DiagnosticSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  status: SessionStatus;
  dtcList: DtcEntry[];
  pidSnapshots: PidSnapshot[];
  metadata?: {
    vehicleMake?: string;
    vehicleModel?: string;
  };
  dtcClearedAt?: number;
  dtcClearResult?: boolean;
}

export interface SessionStore {
  get(sessionId: string): DiagnosticSession | undefined;
  set(sessionId: string, session: DiagnosticSession): void;
  delete(sessionId: string): void;
  cleanup(olderThanMs: number): number;
}

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, DiagnosticSession>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = 3600000) {
    this.ttlMs = ttlMs;
    this.startCleanupTimer();
  }

  get(sessionId: string): DiagnosticSession | undefined {
    return this.sessions.get(sessionId);
  }

  set(sessionId: string, session: DiagnosticSession): void {
    this.sessions.set(sessionId, session);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  cleanup(olderThanMs: number = this.ttlMs): number {
    const now = Date.now();
    let cleaned = 0;

    const entries = Array.from(this.sessions.entries());
    for (const [sessionId, session] of entries) {
      const sessionAge = now - session.startTime;
      if (sessionAge > olderThanMs) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanup();
    }, 300000);
  }
}
