/**
 * Session types and interfaces
 */

export type SessionType = 'thickness' | 'diagnostics';
export type SessionStatus = 'active' | 'completed' | 'expired' | 'failed';

export interface SessionContact {
  email?: string;
  phone?: string;
}

export interface SessionMetadata {
  [key: string]: any;
}

export interface Session {
  id: string;
  type: SessionType;
  status: SessionStatus;
  contact: SessionContact;
  metadata: SessionMetadata;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  expiresAt: number;
}

export interface CreateSessionInput {
  type: SessionType;
  contact: SessionContact;
  metadata?: SessionMetadata;
  ttlMs?: number;
}

export interface UpdateSessionInput {
  status?: SessionStatus;
  contact?: Partial<SessionContact>;
  metadata?: Partial<SessionMetadata>;
  completedAt?: number;
}
