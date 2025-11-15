/**
 * OBD Diagnostic Session
 * Data structures for managing diagnostic sessions
 */
export var SessionStatus;
(function (SessionStatus) {
    SessionStatus["IN_PROGRESS"] = "in_progress";
    SessionStatus["COMPLETED"] = "completed";
    SessionStatus["FAILED"] = "failed";
    SessionStatus["TIMEOUT"] = "timeout";
})(SessionStatus || (SessionStatus = {}));
export class InMemorySessionStore {
    sessions = new Map();
    ttlMs;
    constructor(ttlMs = 3600000) {
        this.ttlMs = ttlMs;
        this.startCleanupTimer();
    }
    get(sessionId) {
        return this.sessions.get(sessionId);
    }
    set(sessionId, session) {
        this.sessions.set(sessionId, session);
    }
    delete(sessionId) {
        this.sessions.delete(sessionId);
    }
    cleanup(olderThanMs = this.ttlMs) {
        const now = Date.now();
        let cleaned = 0;
        for (const [sessionId, session] of this.sessions.entries()) {
            const sessionAge = now - session.startTime;
            if (sessionAge > olderThanMs) {
                this.sessions.delete(sessionId);
                cleaned++;
            }
        }
        return cleaned;
    }
    startCleanupTimer() {
        setInterval(() => {
            this.cleanup();
        }, 300000);
    }
}
