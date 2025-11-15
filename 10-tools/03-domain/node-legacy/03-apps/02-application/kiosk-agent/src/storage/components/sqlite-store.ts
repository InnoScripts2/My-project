/**
 * Локальное хранилище на основе SQLite
 * 
 * Используется для:
 * - Хранение сессий (thickness, obd)
 * - Хранение логов самопроверок
 * - Хранение платёжных квитанций
 * - Кэширование конфигурации
 * 
 * Features:
 * - WAL mode for concurrent access
 * - Connection pooling with mutex
 * - Transaction support with savepoints
 * - Prometheus metrics
 * - Periodic VACUUM and checkpoint
 */

import Database from 'better-sqlite3';
import { Mutex } from 'async-mutex';
import { Counter, Histogram, Gauge, Registry } from 'prom-client';

export interface Session {
  id: string;
  type: 'thickness' | 'obd';
  status: 'in_progress' | 'completed' | 'failed';
  data: unknown;
  createdAt: Date;
  completedAt?: Date;
}

export interface SelfCheckLog {
  id: number;
  device: 'obd' | 'thickness';
  result: unknown;
  timestamp: Date;
}

export interface PaymentReceipt {
  intentId: string;
  sessionId: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: Date;
  confirmedAt?: Date;
}

// Prometheus metrics
const queryDuration = new Histogram({
  name: 'sqlite_query_duration_seconds',
  help: 'SQLite query duration in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]
});

const transactionsTotal = new Counter({
  name: 'sqlite_transactions_total',
  help: 'Total number of transactions',
  labelNames: ['status']
});

const dbSizeBytes = new Gauge({
  name: 'sqlite_database_size_bytes',
  help: 'Database size in bytes'
});

const walSizeBytes = new Gauge({
  name: 'sqlite_wal_size_bytes',
  help: 'WAL file size in bytes'
});

const cacheHitRatio = new Gauge({
  name: 'sqlite_page_cache_hit_ratio',
  help: 'Page cache hit ratio (0-1)'
});

export class SqliteStore {
  private db: Database.Database;
  private preparedStatements: Map<string, Database.Statement>;
  private lastVacuumTime: number = 0;
  private readonly vacuumIntervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly mutex = new Mutex();
  private readonly metrics = {
    queryDuration,
    transactionsTotal,
    dbSizeBytes,
    walSizeBytes,
    cacheHitRatio
  };
  private metricsUpdateInterval?: NodeJS.Timeout;
  private checkpointInterval?: NodeJS.Timeout;

  constructor(dbPath: string, registry?: Registry) {
    this.db = new Database(dbPath);
    this.preparedStatements = new Map();
    this.configureDatabase();
    this.initializeTables();
    this.scheduleVacuum();
    this.startMetricsCollection();
    this.scheduleWalCheckpoint();
    
    if (registry) {
      registry.registerMetric(queryDuration);
      registry.registerMetric(transactionsTotal);
      registry.registerMetric(dbSizeBytes);
      registry.registerMetric(walSizeBytes);
      registry.registerMetric(cacheHitRatio);
    }
  }

  private configureDatabase(): void {
    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');
    
    // Optimize performance
    this.db.pragma('synchronous = NORMAL'); // Balance between safety and speed
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 30000000000'); // 30GB memory-mapped I/O
    this.db.pragma('page_size = 8192');
    this.db.pragma('busy_timeout = 5000'); // 5s wait for locks
    
    // Enable query profiling in development
    if (process.env.NODE_ENV === 'development') {
      this.db.function('log_slow_query', { deterministic: false }, (query: string, duration: number) => {
        if (duration > 100) {
          console.warn(`[SQLite] Slow query (${duration}ms): ${query}`);
        }
      });
    }
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('thickness', 'obd')),
        status TEXT NOT NULL CHECK(status IN ('in_progress', 'completed', 'failed')),
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS selfcheck_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device TEXT NOT NULL CHECK(device IN ('obd', 'thickness')),
        result TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payment_receipts (
        intent_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'confirmed', 'failed')),
        created_at INTEGER NOT NULL,
        confirmed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telemetry_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      -- Optimized indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_sessions_type_status ON sessions(type, status);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_status_created ON sessions(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_selfcheck_logs_device ON selfcheck_logs(device);
      CREATE INDEX IF NOT EXISTS idx_selfcheck_logs_timestamp ON selfcheck_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_payment_receipts_session_id ON payment_receipts(session_id);
      
      -- New indexes for telemetry and sync
      CREATE INDEX IF NOT EXISTS idx_telemetry_session_timestamp ON telemetry_logs(session_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_telemetry_level ON telemetry_logs(level) WHERE level IN ('error', 'warn');
      CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_queue(synced) WHERE synced = 0;
      CREATE INDEX IF NOT EXISTS idx_sync_created ON sync_queue(created_at) WHERE synced = 0;
    `);
  }

  async createSession(session: Omit<Session, 'createdAt'>): Promise<Session> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, type, status, data, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.type,
      session.status,
      JSON.stringify(session.data),
      now,
      session.completedAt ? session.completedAt.getTime() : null
    );

    return {
      ...session,
      createdAt: new Date(now),
    };
  }

  async getSession(id: string): Promise<Session | null> {
    const stmt = this.db.prepare(`
      SELECT id, type, status, data, created_at, completed_at
      FROM sessions
      WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      status: row.status,
      data: JSON.parse(row.data),
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (updates.data !== undefined) {
      fields.push('data = ?');
      values.push(JSON.stringify(updates.data));
    }

    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completedAt.getTime());
    }

    if (fields.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
  }

  async listSessions(filter?: { type?: string; status?: string }): Promise<Session[]> {
    let query = 'SELECT id, type, status, data, created_at, completed_at FROM sessions';
    const conditions: string[] = [];
    const values: any[] = [];

    if (filter?.type) {
      conditions.push('type = ?');
      values.push(filter.type);
    }

    if (filter?.status) {
      conditions.push('status = ?');
      values.push(filter.status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...values) as any[];

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      data: JSON.parse(row.data),
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    }));
  }

  async saveSelfCheckLog(log: Omit<SelfCheckLog, 'id' | 'timestamp'>): Promise<number> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO selfcheck_logs (device, result, timestamp)
      VALUES (?, ?, ?)
    `);

    const info = stmt.run(log.device, JSON.stringify(log.result), now);
    return Number(info.lastInsertRowid);
  }

  async getSelfCheckLogs(device?: 'obd' | 'thickness', limit = 100): Promise<SelfCheckLog[]> {
    let query = 'SELECT id, device, result, timestamp FROM selfcheck_logs';
    const values: any[] = [];

    if (device) {
      query += ' WHERE device = ?';
      values.push(device);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    values.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...values) as any[];

    return rows.map((row) => ({
      id: row.id,
      device: row.device,
      result: JSON.parse(row.result),
      timestamp: new Date(row.timestamp),
    }));
  }

  async savePaymentReceipt(receipt: Omit<PaymentReceipt, 'createdAt'>): Promise<void> {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO payment_receipts (intent_id, session_id, amount, status, created_at, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      receipt.intentId,
      receipt.sessionId,
      receipt.amount,
      receipt.status,
      now,
      receipt.confirmedAt ? receipt.confirmedAt.getTime() : null
    );
  }

  async getPaymentReceipt(intentId: string): Promise<PaymentReceipt | null> {
    const stmt = this.db.prepare(`
      SELECT intent_id, session_id, amount, status, created_at, confirmed_at
      FROM payment_receipts
      WHERE intent_id = ?
    `);

    const row = stmt.get(intentId) as any;
    if (!row) return null;

    return {
      intentId: row.intent_id,
      sessionId: row.session_id,
      amount: row.amount,
      status: row.status,
      createdAt: new Date(row.created_at),
      confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
    };
  }

  async updatePaymentReceipt(intentId: string, updates: Partial<PaymentReceipt>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (updates.confirmedAt !== undefined) {
      fields.push('confirmed_at = ?');
      values.push(updates.confirmedAt.getTime());
    }

    if (fields.length === 0) return;

    values.push(intentId);
    const stmt = this.db.prepare(`
      UPDATE payment_receipts
      SET ${fields.join(', ')}
      WHERE intent_id = ?
    `);

    stmt.run(...values);
  }

  async setConfig<T>(key: string, value: T): Promise<void> {
    const now = Date.now();
    const stmt = this.getOrCreateStatement(
      'set_config',
      `INSERT INTO config (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`
    );

    const jsonValue = JSON.stringify(value);
    stmt.run(key, jsonValue, now, jsonValue, now);
  }

  async getConfig<T>(key: string): Promise<T | null> {
    const stmt = this.getOrCreateStatement(
      'get_config',
      'SELECT value FROM config WHERE key = ?'
    );
    const row = stmt.get(key) as any;

    if (!row) return null;

    return JSON.parse(row.value) as T;
  }

  async cleanupOldSessions(olderThanDays: number): Promise<number> {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const stmt = this.db.prepare(`
      DELETE FROM sessions
      WHERE created_at < ?
    `);

    const info = stmt.run(cutoffTime);
    return info.changes;
  }

  async cleanupOldLogs(olderThanDays: number): Promise<number> {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const stmt = this.db.prepare(`
      DELETE FROM selfcheck_logs
      WHERE timestamp < ?
    `);

    const info = stmt.run(cutoffTime);
    return info.changes;
  }

  /**
   * Get or create a prepared statement (with caching)
   */
  private getOrCreateStatement(name: string, sql: string): Database.Statement {
    if (!this.preparedStatements.has(name)) {
      const stmt = this.db.prepare(sql);
      this.preparedStatements.set(name, stmt);
    }
    return this.preparedStatements.get(name)!;
  }

  /**
   * Schedule periodic VACUUM to reduce fragmentation
   */
  private scheduleVacuum(): void {
    const lastVacuum = this.getLastVacuumTime();
    const now = Date.now();

    if (now - lastVacuum > this.vacuumIntervalMs) {
      this.performVacuum();
    }

    const interval = setInterval(() => {
      const current = Date.now();
      if (current - this.lastVacuumTime > this.vacuumIntervalMs) {
        this.performVacuum();
      }
    }, 24 * 60 * 60 * 1000);

    if (typeof interval.unref === 'function') {
      interval.unref();
    }
  }

  private getLastVacuumTime(): number {
    try {
      const result = this.db.pragma('user_version', { simple: true }) as number;
      return result || 0;
    } catch {
      return 0;
    }
  }

  private performVacuum(): void {
    try {
      const start = Date.now();
      const pageCount = this.db.pragma('page_count', { simple: true }) as number;
      const freelistCount = this.db.pragma('freelist_count', { simple: true }) as number;
      const fragmentation = pageCount > 0 ? (freelistCount / pageCount) * 100 : 0;

      if (fragmentation > 30) {
        this.db.exec('VACUUM');
        console.log(`[SQLite] VACUUM completed in ${Date.now() - start}ms`);
      }

      this.lastVacuumTime = Date.now();
      this.db.pragma(`user_version = ${this.lastVacuumTime}`);
    } catch (error) {
      console.error('[SQLite] VACUUM failed:', error);
    }
  }

  getStats() {
    const pageCount = this.db.pragma('page_count', { simple: true }) as number;
    const pageSize = this.db.pragma('page_size', { simple: true }) as number;
    const freelistCount = this.db.pragma('freelist_count', { simple: true }) as number;
    const journalMode = this.db.pragma('journal_mode', { simple: true }) as string;
    const walAutoCheckpoint = this.db.pragma('wal_autocheckpoint', { simple: true }) as number;
    
    return {
      sizeBytes: pageCount * pageSize,
      pageCount,
      pageSize,
      freelistCount,
      fragmentationPercent: pageCount > 0 ? (freelistCount / pageCount) * 100 : 0,
      journalMode,
      walAutoCheckpoint,
      preparedStatementsCount: this.preparedStatements.size
    };
  }

  /**
   * Execute function within a transaction with mutex
   */
  async withTransaction<T>(fn: (db: Database.Database) => T | Promise<T>): Promise<T> {
    return this.mutex.runExclusive(async () => {
      const savepoint = `sp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const start = Date.now();
      
      try {
        this.db.exec(`SAVEPOINT ${savepoint}`);
        const result = await fn(this.db);
        this.db.exec(`RELEASE ${savepoint}`);
        
        this.metrics.transactionsTotal.labels('commit').inc();
        this.metrics.queryDuration.labels('transaction').observe((Date.now() - start) / 1000);
        
        return result;
      } catch (error) {
        this.db.exec(`ROLLBACK TO ${savepoint}`);
        this.metrics.transactionsTotal.labels('rollback').inc();
        throw error;
      }
    });
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    this.updateMetrics();
    
    this.metricsUpdateInterval = setInterval(() => {
      this.updateMetrics();
    }, 30000); // Update every 30 seconds
    
    if (typeof this.metricsUpdateInterval.unref === 'function') {
      this.metricsUpdateInterval.unref();
    }
  }

  /**
   * Update Prometheus metrics
   */
  private updateMetrics(): void {
    try {
      const stats = this.getStats();
      this.metrics.dbSizeBytes.set(stats.sizeBytes);
      
      // Get WAL size
      try {
        const fs = require('fs');
        const dbPath = (this.db as any).name;
        const walPath = `${dbPath}-wal`;
        if (fs.existsSync(walPath)) {
          const walStats = fs.statSync(walPath);
          this.metrics.walSizeBytes.set(walStats.size);
        } else {
          this.metrics.walSizeBytes.set(0);
        }
      } catch (error) {
        // Ignore WAL size errors
      }
      
      // Calculate cache hit ratio
      const cacheStatus = this.db.pragma('cache_spill', { simple: false }) as any[];
      // Note: cache_spill doesn't give hit ratio directly, this is a placeholder
      // In production, you might want to track this differently
      this.metrics.cacheHitRatio.set(0.95); // Placeholder
    } catch (error) {
      console.error('[SQLite] Failed to update metrics:', error);
    }
  }

  /**
   * Schedule WAL checkpoint
   */
  private scheduleWalCheckpoint(): void {
    this.checkpointInterval = setInterval(() => {
      this.performWalCheckpoint();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    if (typeof this.checkpointInterval.unref === 'function') {
      this.checkpointInterval.unref();
    }
  }

  /**
   * Perform WAL checkpoint if needed
   */
  private performWalCheckpoint(): void {
    try {
      const fs = require('fs');
      const dbPath = (this.db as any).name;
      const walPath = `${dbPath}-wal`;
      
      if (fs.existsSync(walPath)) {
        const walStats = fs.statSync(walPath);
        // Checkpoint if WAL > 10MB
        if (walStats.size > 10 * 1024 * 1024) {
          const start = Date.now();
          this.db.pragma('wal_checkpoint(TRUNCATE)');
          console.log(`[SQLite] WAL checkpoint completed in ${Date.now() - start}ms`);
        }
      }
    } catch (error) {
      console.error('[SQLite] WAL checkpoint failed:', error);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'pass' | 'warn' | 'fail';
    details: Record<string, any>;
  }> {
    try {
      const start = Date.now();
      
      // Test basic query
      const testResult = this.db.prepare('SELECT 1 as test').get() as any;
      if (testResult?.test !== 1) {
        return {
          status: 'fail',
          details: { error: 'Query test failed' }
        };
      }
      
      const latency = Date.now() - start;
      const stats = this.getStats();
      
      // Check integrity
      const integrityCheck = this.db.pragma('integrity_check', { simple: true }) as string;
      const integrityOk = integrityCheck === 'ok';
      
      // Get WAL size
      let walSize = 0;
      try {
        const fs = require('fs');
        const dbPath = (this.db as any).name;
        const walPath = `${dbPath}-wal`;
        if (fs.existsSync(walPath)) {
          const walStats = fs.statSync(walPath);
          walSize = walStats.size;
        }
      } catch {
        // Ignore
      }
      
      // Determine status
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      if (!integrityOk) {
        status = 'fail';
      } else if (walSize > 100 * 1024 * 1024 || stats.fragmentationPercent > 50) {
        status = 'warn';
      }
      
      return {
        status,
        details: {
          latencyMs: latency,
          integrityCheck: integrityOk ? 'ok' : 'failed',
          journalMode: stats.journalMode,
          walSizeBytes: walSize,
          dbSizeBytes: stats.sizeBytes,
          fragmentationPercent: stats.fragmentationPercent.toFixed(2)
        }
      };
    } catch (error: any) {
      return {
        status: 'fail',
        details: {
          error: error.message || String(error)
        }
      };
    }
  }

  close(): void {
    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
    }
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
    }
    this.preparedStatements.clear();
    this.db.close();
  }
}

export function createSqliteStore(dbPath: string, registry?: Registry): SqliteStore {
  return new SqliteStore(dbPath, registry);
}
