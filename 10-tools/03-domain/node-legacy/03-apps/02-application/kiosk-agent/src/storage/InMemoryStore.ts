import type { PersistenceStore, SessionKind, ThicknessPointRecord } from './types.js'

export class InMemoryStore implements PersistenceStore {
  private sessions = new Map<string, { kind: SessionKind; startedAt: string; finishedAt?: string }>()
  private thicknessPoints = new Map<string, ThicknessPointRecord>()

  async createSession(kind: SessionKind, id?: string): Promise<string> {
    const sessionId = id || `${kind[0].toUpperCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`
    this.sessions.set(sessionId, { kind, startedAt: new Date().toISOString() })
    return sessionId
  }

  async finishSession(id: string): Promise<void> {
    const s = this.sessions.get(id)
    if (s) s.finishedAt = new Date().toISOString()
  }

  async recordThicknessPoint(rec: ThicknessPointRecord): Promise<void> {
    const key = `${rec.sessionId}::${rec.pointId}`
    this.thicknessPoints.set(key, { ...rec })
  }

  async ping(): Promise<void> {
    // In-memory store is always available
    return Promise.resolve();
  }
}
