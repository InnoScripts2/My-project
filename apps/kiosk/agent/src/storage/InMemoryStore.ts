import { PersistenceStore, ThicknessPointRecord } from './types.js';
export class InMemoryStore implements PersistenceStore {
  private sessions = new Map<string,{ type: string; external?: string }>();
  private points: ThicknessPointRecord[] = [];
  async createSession(type: 'thickness'|'diagnostics', externalId?: string) {
    const id = `${type}-${externalId || Date.now()}`;
    this.sessions.set(id,{ type, external: externalId });
    return id;
  }
  async recordThicknessPoint(p: ThicknessPointRecord) { this.points.push(p); }
  async finishSession(_id: string) { /* no-op finalize */ }
}

