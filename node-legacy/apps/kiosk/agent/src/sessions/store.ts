/**
 * SQLite store for sessions
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Session, CreateSessionInput, UpdateSessionInput } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SessionStore {
  private db: Database.Database;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(dbPath?: string) {
    const storageDir = path.join(__dirname, '../../storage');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    const finalDbPath = dbPath || path.join(storageDir, 'core.sqlite');
    this.db = new Database(finalDbPath);
    this.db.pragma('journal_mode = WAL');
    this.initializeSchema();
    this.startCleanupTask();
  }

  private initializeSchema(): void {
    const migrationsDir = path.join(__dirname, '../../migrations');
    const migrationFile = path.join(migrationsDir, '001_initial_schema.sql');
    
    if (fs.existsSync(migrationFile)) {
      const schema = fs.readFileSync(migrationFile, 'utf-8');
      this.db.exec(schema);
    }
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const id = this.generateId(input.type);
    const now = Date.now();
    const ttl = input.ttlMs || 3600000; // 1 hour default
    const expiresAt = now + ttl;

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, type, status, contact_email, contact_phone, metadata, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.type,
      'active',
      input.contact.email || null,
      input.contact.phone || null,
      JSON.stringify(input.metadata || {}),
      now,
      now,
      expiresAt
    );

    return this.get(id)!;
  }

  get(id: string): Session | null {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `);
    const row = stmt.get(id) as any;
    
    if (!row) return null;

    return this.rowToSession(row);
  }

  async update(id: string, input: UpdateSessionInput): Promise<Session | null> {
    const existing = this.get(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: any[] = [];

    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }

    if (input.contact?.email !== undefined) {
      updates.push('contact_email = ?');
      params.push(input.contact.email || null);
    }

    if (input.contact?.phone !== undefined) {
      updates.push('contact_phone = ?');
      params.push(input.contact.phone || null);
    }

    if (input.metadata !== undefined) {
      const newMetadata = { ...existing.metadata, ...input.metadata };
      updates.push('metadata = ?');
      params.push(JSON.stringify(newMetadata));
    }

    if (input.completedAt !== undefined) {
      updates.push('completed_at = ?');
      params.push(input.completedAt);
    }

    updates.push('updated_at = ?');
    params.push(Date.now());

    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE sessions SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...params);

    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  list(filters?: { type?: string; status?: string; limit?: number }): Session[] {
    let query = 'SELECT * FROM sessions WHERE 1=1';
    const params: any[] = [];

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    return rows.map(row => this.rowToSession(row));
  }

  cleanup(olderThanMs: number = 86400000): number {
    const cutoff = Date.now() - olderThanMs;
    const stmt = this.db.prepare(`
      DELETE FROM sessions 
      WHERE expires_at < ? OR (status = 'active' AND created_at < ?)
    `);
    const result = stmt.run(Date.now(), cutoff);
    return result.changes;
  }

  private startCleanupTask(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      const deleted = this.cleanup();
      if (deleted > 0) {
        console.log(`[SessionStore] Cleaned up ${deleted} expired sessions`);
      }
    }, 3600000);
  }

  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  close(): void {
    this.stopCleanupTask();
    this.db.close();
  }

  private generateId(type: string): string {
    const prefix = type === 'thickness' ? 'THK' : 'OBD';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  private rowToSession(row: any): Session {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      contact: {
        email: row.contact_email || undefined,
        phone: row.contact_phone || undefined,
      },
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at || undefined,
      expiresAt: row.expires_at,
    };
  }
}
