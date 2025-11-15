export type SessionKind = 'thickness' | 'diagnostics'

export interface ThicknessPointRecord {
  sessionId: string
  pointId: string
  label: string
  status: 'pending' | 'measured' | 'skipped'
  valueMicrons?: number
  measuredAt?: string
}

export interface PersistenceStore {
  createSession(kind: SessionKind, id?: string): Promise<string>
  finishSession(id: string): Promise<void>

  recordThicknessPoint(rec: ThicknessPointRecord): Promise<void>
  
  // Health check support
  ping?(): Promise<void>
}
