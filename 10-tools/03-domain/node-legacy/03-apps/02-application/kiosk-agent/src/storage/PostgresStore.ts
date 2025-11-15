import { Pool } from 'pg'
import type { PersistenceStore, SessionKind, ThicknessPointRecord } from './types.js'

function buildPgConfig() {
  const { DATABASE_URL } = process.env as Record<string, string | undefined>
  if (DATABASE_URL && DATABASE_URL.trim()) {
    return { connectionString: DATABASE_URL.trim(), max: 5 }
  }
  const host = process.env.PGHOST
  const port = process.env.PGPORT ? Number(process.env.PGPORT) : undefined
  const user = process.env.PGUSER
  const password = process.env.PGPASSWORD
  const database = process.env.PGDATABASE
  if (host && database) {
    return { host, port, user, password, database, max: 5 }
  }
  return null
}

export class PostgresStore implements PersistenceStore {
  private pool: Pool

  constructor() {
    const cfg = buildPgConfig()
    if (!cfg) {
      throw Object.assign(new Error('Postgres config is not set'), { code: 'pg_config_missing' })
    }
    this.pool = new Pool(cfg as any)
  }

  async createSession(kind: SessionKind, id?: string): Promise<string> {
    const sessionId = id || `${kind[0].toUpperCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`
    const text = 'INSERT INTO sessions(id, kind) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING'
    await this.pool.query(text, [sessionId, kind])
    return sessionId
  }

  async finishSession(id: string): Promise<void> {
    const text = "UPDATE sessions SET finished_at = now(), status = 'finished' WHERE id = $1"
    await this.pool.query(text, [id])
  }

  async recordThicknessPoint(rec: ThicknessPointRecord): Promise<void> {
    const q = `INSERT INTO thickness_points(session_id, point_id, label, status, value_microns, measured_at)
               VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (session_id, point_id)
               DO UPDATE SET label = EXCLUDED.label,
                             status = EXCLUDED.status,
                             value_microns = EXCLUDED.value_microns,
                             measured_at = EXCLUDED.measured_at`
    await this.pool.query(q, [
      rec.sessionId,
      rec.pointId,
      rec.label,
      rec.status,
      rec.valueMicrons ?? null,
      rec.measuredAt ?? null,
    ])
  }

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }
}
