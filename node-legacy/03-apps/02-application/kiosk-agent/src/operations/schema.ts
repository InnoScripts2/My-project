/**
 * Database schema migration for Operations and SLA Management
 * 
 * Creates tables for:
 * - downtime tracking
 * - incident management
 */

export const operationsSchemaSql = `
  -- Downtime tracking table
  CREATE TABLE IF NOT EXISTS downtime (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (reason) REFERENCES incidents(incident_id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_downtime_start ON downtime(start_time);
  CREATE INDEX IF NOT EXISTS idx_downtime_end ON downtime(end_time);
  CREATE INDEX IF NOT EXISTS idx_downtime_range ON downtime(start_time, end_time);

  -- Incidents table
  CREATE TABLE IF NOT EXISTS incidents (
    incident_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'critical')),
    affected_services TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('investigating', 'identified', 'monitoring', 'resolved')),
    started_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution TEXT,
    escalation_level INTEGER DEFAULT 0,
    escalated_at TEXT,
    updates TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
  CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
  CREATE INDEX IF NOT EXISTS idx_incidents_started ON incidents(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_incidents_resolved ON incidents(resolved_at);
  CREATE INDEX IF NOT EXISTS idx_incidents_status_severity ON incidents(status, severity);
`;

export function initializeOperationsTables(db: any): void {
  db.exec(operationsSchemaSql);
}
