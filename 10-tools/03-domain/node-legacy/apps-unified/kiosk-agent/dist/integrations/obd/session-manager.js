import { randomUUID } from 'crypto';
export class ObdSessionManager {
    constructor() {
        this.sessions = new Map();
        this.cleanupInterval = null;
        this.startCleanupTask();
    }
    createSession(vehicleData) {
        const sessionId = randomUUID();
        const now = new Date().toISOString();
        const session = {
            sessionId,
            vehicleMake: vehicleData.make,
            vehicleModel: vehicleData.model,
            dtcCodes: [],
            pidsSnapshot: [],
            timestamp: now,
            status: 'active',
            createdAt: now,
        };
        this.sessions.set(sessionId, session);
        return sessionId;
    }
    updateSession(sessionId, data) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        if (data.dtc) {
            session.dtcCodes = data.dtc;
        }
        if (data.pids) {
            session.pidsSnapshot = data.pids;
        }
        if (data.vin) {
            session.vin = data.vin;
        }
        if (data.vendor) {
            session.vendorData = data.vendor;
        }
        session.timestamp = new Date().toISOString();
    }
    completeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        session.status = 'completed';
        session.completedAt = new Date().toISOString();
        return session;
    }
    markSessionPaid(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        session.status = 'paid';
        session.paidAt = new Date().toISOString();
    }
    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }
    deleteSession(sessionId) {
        this.sessions.delete(sessionId);
    }
    cleanupOldSessions() {
        const now = Date.now();
        const cutoff = now - (24 * 60 * 60 * 1000); // 24 hours ago
        let deletedCount = 0;
        for (const [sessionId, session] of this.sessions.entries()) {
            const sessionTime = new Date(session.createdAt).getTime();
            if (sessionTime < cutoff) {
                this.sessions.delete(sessionId);
                deletedCount++;
            }
        }
        return deletedCount;
    }
    startCleanupTask() {
        // Run cleanup every hour
        this.cleanupInterval = setInterval(() => {
            const deleted = this.cleanupOldSessions();
            if (deleted > 0) {
                console.log(`[ObdSessionManager] Cleaned up ${deleted} old sessions`);
            }
        }, 60 * 60 * 1000);
    }
    stopCleanupTask() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
    getAllSessions() {
        return Array.from(this.sessions.values());
    }
}
export const obdSessionManager = new ObdSessionManager();
