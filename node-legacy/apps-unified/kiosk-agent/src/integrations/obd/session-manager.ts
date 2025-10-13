import { randomUUID } from 'crypto';

export interface SessionData {
  sessionId: string;
  vehicleMake: string;
  vehicleModel: string;
  vin?: string;
  dtcCodes: any[];
  pidsSnapshot: any[];
  vendorData?: any;
  timestamp: string;
  status: 'active' | 'completed' | 'paid';
  createdAt: string;
  completedAt?: string;
  paidAt?: string;
}

export class ObdSessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTask();
  }

  createSession(vehicleData: { make: string; model: string }): string {
    const sessionId = randomUUID();
    const now = new Date().toISOString();
    
    const session: SessionData = {
      sessionId,
      vehicleMake: vehicleData.make,
      vehicleModel: vehicleData.model,
      dtcCodes: [],
      pidsSnapshot: [],
      timestamp: now,
      status: 'active',
      createdAt: now,
    };

    this.sessions.set(sessionId, session);
    return sessionId;
  }

  updateSession(sessionId: string, data: {
    dtc?: any[];
    pids?: any[];
    vin?: string;
    vendor?: any;
  }): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (data.dtc) {
      session.dtcCodes = data.dtc;
    }
    if (data.pids) {
      session.pidsSnapshot = data.pids;
    }
    if (data.vin) {
      session.vin = data.vin;
    }
    if (data.vendor) {
      session.vendorData = data.vendor;
    }

    session.timestamp = new Date().toISOString();
  }

  completeSession(sessionId: string): SessionData {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.status = 'completed';
    session.completedAt = new Date().toISOString();
    return session;
  }

  markSessionPaid(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.status = 'paid';
    session.paidAt = new Date().toISOString();
  }

  getSession(sessionId: string): SessionData | null {
    return this.sessions.get(sessionId) || null;
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  cleanupOldSessions(): number {
    const now = Date.now();
    const cutoff = now - (24 * 60 * 60 * 1000); // 24 hours ago
    let deletedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const sessionTime = new Date(session.createdAt).getTime();
      if (sessionTime < cutoff) {
        this.sessions.delete(sessionId);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  private startCleanupTask(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      const deleted = this.cleanupOldSessions();
      if (deleted > 0) {
        console.log(`[ObdSessionManager] Cleaned up ${deleted} old sessions`);
      }
    }, 60 * 60 * 1000);
  }

  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  getAllSessions(): SessionData[] {
    return Array.from(this.sessions.values());
  }
}

export const obdSessionManager = new ObdSessionManager();
