export class InMemoryStore {
    constructor() {
        this.sessions = new Map();
        this.thicknessPoints = new Map();
    }
    async createSession(kind, id) {
        const sessionId = id || `${kind[0].toUpperCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        this.sessions.set(sessionId, { kind, startedAt: new Date().toISOString() });
        return sessionId;
    }
    async finishSession(id) {
        const s = this.sessions.get(id);
        if (s)
            s.finishedAt = new Date().toISOString();
    }
    async recordThicknessPoint(rec) {
        const key = `${rec.sessionId}::${rec.pointId}`;
        this.thicknessPoints.set(key, { ...rec });
    }
    async ping() {
        // In-memory store is always available
        return Promise.resolve();
    }
}
