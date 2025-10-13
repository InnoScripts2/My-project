/**
 * Payment store with SQLite persistence
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PaymentRecord {
  intentId: string;
  sessionId?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'failed' | 'expired';
  provider: string;
  qrCodeUrl?: string;
  qrCodeData?: string;
  metadata?: any;
  createdAt: number;
  updatedAt: number;
  confirmedAt?: number;
  expiresAt: number;
}

export class PaymentStore {
  private db: Database.Database;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(dbPath?: string) {
    const finalDbPath = dbPath || path.join(__dirname, '../../../storage/core.sqlite');
    this.db = new Database(finalDbPath);
    this.db.pragma('journal_mode = WAL');
    this.startCleanupTask();
  }

  save(record: PaymentRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO payments (
        intent_id, session_id, amount, currency, status, provider,
        qr_code_url, qr_code_data, metadata, created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      record.intentId,
      record.sessionId || null,
      record.amount,
      record.currency,
      record.status,
      record.provider,
      record.qrCodeUrl || null,
      record.qrCodeData || null,
      JSON.stringify(record.metadata || {}),
      record.createdAt,
      record.updatedAt,
      record.expiresAt
    );
  }

  get(intentId: string): PaymentRecord | null {
    const stmt = this.db.prepare('SELECT * FROM payments WHERE intent_id = ?');
    const row = stmt.get(intentId) as any;
    
    if (!row) return null;

    return this.rowToRecord(row);
  }

  update(intentId: string, updates: Partial<PaymentRecord>): boolean {
    const existing = this.get(intentId);
    if (!existing) return false;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (updates.sessionId !== undefined) {
      fields.push('session_id = ?');
      values.push(updates.sessionId);
    }

    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    if (updates.confirmedAt !== undefined) {
      fields.push('confirmed_at = ?');
      values.push(updates.confirmedAt);
    }

    fields.push('updated_at = ?');
    values.push(Date.now());

    values.push(intentId);

    const stmt = this.db.prepare(`
      UPDATE payments SET ${fields.join(', ')} WHERE intent_id = ?
    `);
    stmt.run(...values);

    return true;
  }

  delete(intentId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM payments WHERE intent_id = ?');
    const result = stmt.run(intentId);
    return result.changes > 0;
  }

  cleanup(): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      DELETE FROM payments 
      WHERE expires_at < ? AND status IN ('pending', 'expired')
    `);
    const result = stmt.run(now);
    return result.changes;
  }

  private startCleanupTask(): void {
    // Run cleanup every 10 minutes
    this.cleanupInterval = setInterval(() => {
      const deleted = this.cleanup();
      if (deleted > 0) {
        console.log(`[PaymentStore] Cleaned up ${deleted} expired payments`);
      }
    }, 600000);
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

  private rowToRecord(row: any): PaymentRecord {
    return {
      intentId: row.intent_id,
      sessionId: row.session_id || undefined,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      provider: row.provider,
      qrCodeUrl: row.qr_code_url || undefined,
      qrCodeData: row.qr_code_data || undefined,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      confirmedAt: row.confirmed_at || undefined,
      expiresAt: row.expires_at,
    };
  }
}
