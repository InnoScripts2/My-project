/**
 * SQLite storage для состояния устройств и событий
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

export interface DeviceConnectionEvent {
  id: string;
  timestamp: string;
  deviceType: 'obd' | 'thickness';
  eventType: 'connected' | 'disconnected' | 'error' | 'reconnect_attempt';
  state: string;
  previousState?: string;
  error?: string;
  metadata?: string;
}

export interface DeviceStateRecord {
  deviceType: 'obd' | 'thickness';
  state: string;
  connected: boolean;
  lastConnected?: string;
  lastError?: string;
  updatedAt: string;
  metadata?: string;
}

export interface DeviceConnectionRecord {
  id: string;
  deviceType: 'obd' | 'thickness';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  stateTransitions?: string;
  success: boolean;
  error?: string;
  metadata?: string;
}

export interface DeviceMetricRecord {
  deviceType: 'obd' | 'thickness';
  timestamp: string;
  metricName: string;
  metricValue: number;
  unit?: string;
  metadata?: string;
}

export interface ObdSessionRecord {
  id: string;
  startedAt: string;
  endedAt?: string;
  adapterInfo?: string;
  protocol?: string;
  dtcCount?: number;
  dtcCodes?: string;
  dtcCleared?: boolean;
  pidsRead?: string;
  success: boolean;
  error?: string;
  metadata?: string;
}

export interface ThicknessSessionRecord {
  id: string;
  startedAt: string;
  endedAt?: string;
  deviceName?: string;
  deviceAddress?: string;
  totalZones: number;
  measuredZones: number;
  measurements?: string;
  success: boolean;
  error?: string;
  metadata?: string;
}

export class DeviceStorage {
  private db: Database.Database;

  constructor(dbPath: string = join(process.cwd(), 'storage', 'devices.sqlite')) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS device_states (
        device_type TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        connected INTEGER NOT NULL,
        last_connected TEXT,
        last_error TEXT,
        updated_at TEXT NOT NULL,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS device_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        device_type TEXT NOT NULL,
        event_type TEXT NOT NULL,
        state TEXT NOT NULL,
        previous_state TEXT,
        error TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS device_connections (
        id TEXT PRIMARY KEY,
        device_type TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_ms INTEGER,
        state_transitions TEXT,
        success INTEGER,
        error TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS device_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        unit TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS obd_sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        adapter_info TEXT,
        protocol TEXT,
        dtc_count INTEGER,
        dtc_codes TEXT,
        dtc_cleared INTEGER,
        pids_read TEXT,
        success INTEGER,
        error TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS thickness_sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        device_name TEXT,
        device_address TEXT,
        total_zones INTEGER,
        measured_zones INTEGER,
        measurements TEXT,
        success INTEGER,
        error TEXT,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_device_events_timestamp 
        ON device_events(timestamp DESC);
      
      CREATE INDEX IF NOT EXISTS idx_device_events_type 
        ON device_events(device_type, event_type);

      CREATE INDEX IF NOT EXISTS idx_device_connections_device_time
        ON device_connections(device_type, started_at DESC);

      CREATE INDEX IF NOT EXISTS idx_device_metrics_device_time
        ON device_metrics(device_type, timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_device_metrics_name
        ON device_metrics(metric_name, timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_obd_sessions_time
        ON obd_sessions(started_at DESC);

      CREATE INDEX IF NOT EXISTS idx_thickness_sessions_time
        ON thickness_sessions(started_at DESC);
    `);
  }

  saveState(record: DeviceStateRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO device_states 
        (device_type, state, connected, last_connected, last_error, updated_at, metadata)
      VALUES 
        (@deviceType, @state, @connected, @lastConnected, @lastError, @updatedAt, @metadata)
    `);

    stmt.run({
      deviceType: record.deviceType,
      state: record.state,
      connected: record.connected ? 1 : 0,
      lastConnected: record.lastConnected || null,
      lastError: record.lastError || null,
      updatedAt: record.updatedAt,
      metadata: record.metadata || null,
    });
  }

  getState(deviceType: 'obd' | 'thickness'): DeviceStateRecord | null {
    const stmt = this.db.prepare(`
      SELECT device_type as deviceType, state, connected, last_connected as lastConnected,
             last_error as lastError, updated_at as updatedAt, metadata
      FROM device_states
      WHERE device_type = ?
    `);

    const row = stmt.get(deviceType) as any;
    if (!row) return null;

    return {
      ...row,
      connected: Boolean(row.connected),
    };
  }

  recordEvent(event: DeviceConnectionEvent): void {
    const stmt = this.db.prepare(`
      INSERT INTO device_events 
        (id, timestamp, device_type, event_type, state, previous_state, error, metadata)
      VALUES 
        (@id, @timestamp, @deviceType, @eventType, @state, @previousState, @error, @metadata)
    `);

    stmt.run({
      id: event.id,
      timestamp: event.timestamp,
      deviceType: event.deviceType,
      eventType: event.eventType,
      state: event.state,
      previousState: event.previousState || null,
      error: event.error || null,
      metadata: event.metadata || null,
    });
  }

  getRecentEvents(
    deviceType: 'obd' | 'thickness',
    limit: number = 100
  ): DeviceConnectionEvent[] {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, device_type as deviceType, event_type as eventType,
             state, previous_state as previousState, error, metadata
      FROM device_events
      WHERE device_type = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(deviceType, limit) as DeviceConnectionEvent[];
  }

  recordConnectionSession(record: DeviceConnectionRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO device_connections
        (id, device_type, started_at, ended_at, duration_ms, state_transitions, success, error, metadata)
      VALUES
        (@id, @deviceType, @startedAt, @endedAt, @durationMs, @stateTransitions, @success, @error, @metadata)
    `);

    stmt.run({
      id: record.id,
      deviceType: record.deviceType,
      startedAt: record.startedAt,
      endedAt: record.endedAt || null,
      durationMs: record.durationMs || null,
      stateTransitions: record.stateTransitions || null,
      success: record.success ? 1 : 0,
      error: record.error || null,
      metadata: record.metadata || null,
    });
  }

  recordMetric(record: DeviceMetricRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO device_metrics
        (device_type, timestamp, metric_name, metric_value, unit, metadata)
      VALUES
        (@deviceType, @timestamp, @metricName, @metricValue, @unit, @metadata)
    `);

    stmt.run({
      deviceType: record.deviceType,
      timestamp: record.timestamp,
      metricName: record.metricName,
      metricValue: record.metricValue,
      unit: record.unit || null,
      metadata: record.metadata || null,
    });
  }

  getMetrics(
    deviceType: 'obd' | 'thickness',
    metricName?: string,
    limit: number = 100
  ): DeviceMetricRecord[] {
    let sql = `
      SELECT device_type as deviceType, timestamp, metric_name as metricName,
             metric_value as metricValue, unit, metadata
      FROM device_metrics
      WHERE device_type = ?
    `;

    const params: any[] = [deviceType];

    if (metricName) {
      sql += ' AND metric_name = ?';
      params.push(metricName);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as DeviceMetricRecord[];
  }

  recordObdSession(record: ObdSessionRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO obd_sessions
        (id, started_at, ended_at, adapter_info, protocol, dtc_count, dtc_codes, dtc_cleared, pids_read, success, error, metadata)
      VALUES
        (@id, @startedAt, @endedAt, @adapterInfo, @protocol, @dtcCount, @dtcCodes, @dtcCleared, @pidsRead, @success, @error, @metadata)
    `);

    stmt.run({
      id: record.id,
      startedAt: record.startedAt,
      endedAt: record.endedAt || null,
      adapterInfo: record.adapterInfo || null,
      protocol: record.protocol || null,
      dtcCount: record.dtcCount || null,
      dtcCodes: record.dtcCodes || null,
      dtcCleared: record.dtcCleared ? 1 : 0,
      pidsRead: record.pidsRead || null,
      success: record.success ? 1 : 0,
      error: record.error || null,
      metadata: record.metadata || null,
    });
  }

  recordThicknessSession(record: ThicknessSessionRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO thickness_sessions
        (id, started_at, ended_at, device_name, device_address, total_zones, measured_zones, measurements, success, error, metadata)
      VALUES
        (@id, @startedAt, @endedAt, @deviceName, @deviceAddress, @totalZones, @measuredZones, @measurements, @success, @error, @metadata)
    `);

    stmt.run({
      id: record.id,
      startedAt: record.startedAt,
      endedAt: record.endedAt || null,
      deviceName: record.deviceName || null,
      deviceAddress: record.deviceAddress || null,
      totalZones: record.totalZones,
      measuredZones: record.measuredZones,
      measurements: record.measurements || null,
      success: record.success ? 1 : 0,
      error: record.error || null,
      metadata: record.metadata || null,
    });
  }

  getRecentObdSessions(limit: number = 10): ObdSessionRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, started_at as startedAt, ended_at as endedAt, adapter_info as adapterInfo,
             protocol, dtc_count as dtcCount, dtc_codes as dtcCodes, dtc_cleared as dtcCleared,
             pids_read as pidsRead, success, error, metadata
      FROM obd_sessions
      ORDER BY started_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as any[];
    return rows.map(row => ({
      ...row,
      success: Boolean(row.success),
      dtcCleared: Boolean(row.dtcCleared),
    }));
  }

  getRecentThicknessSessions(limit: number = 10): ThicknessSessionRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, started_at as startedAt, ended_at as endedAt, device_name as deviceName,
             device_address as deviceAddress, total_zones as totalZones, measured_zones as measuredZones,
             measurements, success, error, metadata
      FROM thickness_sessions
      ORDER BY started_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as any[];
    return rows.map(row => ({
      ...row,
      success: Boolean(row.success),
    }));
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let storageInstance: DeviceStorage | null = null;

export function getDeviceStorage(): DeviceStorage {
  if (!storageInstance) {
    storageInstance = new DeviceStorage();
  }
  return storageInstance;
}
