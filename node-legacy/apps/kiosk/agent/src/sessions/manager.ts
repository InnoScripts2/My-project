/**
 * Session manager with timeout and auto-reset
 */

import { SessionStore } from './store.js';
import type { Session, CreateSessionInput, UpdateSessionInput } from './types.js';

export interface SessionManagerConfig {
  defaultTtlMs?: number;
  autoResetOnTimeout?: boolean;
}

export class SessionManager {
  private store: SessionStore;
  private config: Required<SessionManagerConfig>;
  private sessionTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(store: SessionStore, config?: SessionManagerConfig) {
    this.store = store;
    this.config = {
      defaultTtlMs: config?.defaultTtlMs || 3600000, // 1 hour
      autoResetOnTimeout: config?.autoResetOnTimeout ?? true,
    };
  }

  async createSession(input: CreateSessionInput): Promise<Session> {
    const session = await this.store.create({
      ...input,
      ttlMs: input.ttlMs || this.config.defaultTtlMs,
    });

    if (this.config.autoResetOnTimeout) {
      this.setupAutoReset(session.id, session.expiresAt);
    }

    return session;
  }

  async getSession(id: string): Promise<Session | null> {
    const session = this.store.get(id);
    
    if (!session) {
      return null;
    }

    // Check if expired
    if (session.expiresAt < Date.now() && session.status === 'active') {
      await this.expireSession(id);
      return this.store.get(id);
    }

    return session;
  }

  async updateSession(id: string, input: UpdateSessionInput): Promise<Session | null> {
    return this.store.update(id, input);
  }

  async completeSession(id: string, metadata?: any): Promise<Session | null> {
    this.clearAutoReset(id);
    return this.store.update(id, {
      status: 'completed',
      completedAt: Date.now(),
      metadata,
    });
  }

  async expireSession(id: string): Promise<Session | null> {
    this.clearAutoReset(id);
    return this.store.update(id, {
      status: 'expired',
    });
  }

  async failSession(id: string, reason?: string): Promise<Session | null> {
    this.clearAutoReset(id);
    return this.store.update(id, {
      status: 'failed',
      metadata: reason ? { failureReason: reason } : undefined,
    });
  }

  async deleteSession(id: string): Promise<boolean> {
    this.clearAutoReset(id);
    return this.store.delete(id);
  }

  listSessions(filters?: { type?: string; status?: string; limit?: number }): Session[] {
    return this.store.list(filters);
  }

  private setupAutoReset(sessionId: string, expiresAt: number): void {
    const timeUntilExpiry = expiresAt - Date.now();
    
    if (timeUntilExpiry <= 0) {
      this.expireSession(sessionId);
      return;
    }

    const timer = setTimeout(() => {
      console.log(`[SessionManager] Auto-expiring session ${sessionId}`);
      this.expireSession(sessionId);
    }, timeUntilExpiry);

    this.sessionTimers.set(sessionId, timer);
  }

  private clearAutoReset(sessionId: string): void {
    const timer = this.sessionTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.sessionTimers.delete(sessionId);
    }
  }

  cleanup(): number {
    return this.store.cleanup();
  }

  close(): void {
    // Clear all timers
    for (const timer of this.sessionTimers.values()) {
      clearTimeout(timer);
    }
    this.sessionTimers.clear();
    this.store.close();
  }
}
