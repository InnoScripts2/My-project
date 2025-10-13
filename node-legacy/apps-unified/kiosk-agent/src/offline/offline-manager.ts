/**
 * Offline/Online Mode Manager
 * Ensures terminal works without internet connection
 */

import Dexie, { Table } from 'dexie';

export interface OfflineSession {
  id: string;
  sessionCode: string;
  serviceType: 'thickness' | 'diagnostics';
  status: string;
  terminalId: string;
  measurements?: any[];
  diagnostics?: any;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  createdAt: Date;
  syncedAt?: Date;
  remoteId?: string;
  syncError?: string;
}

export interface OfflineMeasurement {
  id: string;
  sessionId: string;
  zoneIndex: number;
  zoneName: string;
  thicknessMicrons: number;
  status: string;
  syncStatus: 'pending' | 'synced' | 'failed';
  createdAt: Date;
}

/**
 * IndexedDB database for offline storage
 */
class OfflineDatabase extends Dexie {
  sessions!: Table<OfflineSession>;
  measurements!: Table<OfflineMeasurement>;
  reports!: Table<any>;

  constructor() {
    super('KioskOfflineDB');
    this.version(1).stores({
      sessions: '++id, sessionCode, syncStatus, createdAt, terminalId',
      measurements: '++id, sessionId, syncStatus, createdAt',
      reports: '++id, sessionId, syncStatus',
    });
  }
}

export const offlineDB = new OfflineDatabase();

/**
 * Offline Manager
 */
export class OfflineManager {
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;

    // Monitor network status
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }

    // Check connection every 30 seconds
    setInterval(() => this.checkConnection(), 30000);
  }

  /**
   * Create session (always saves locally first)
   */
  async createSession(sessionData: Omit<OfflineSession, 'id' | 'syncStatus' | 'createdAt'>): Promise<OfflineSession> {
    const session: OfflineSession = {
      ...sessionData,
      id: crypto.randomUUID(),
      syncStatus: 'pending',
      createdAt: new Date(),
    };

    // Save locally
    await offlineDB.sessions.add(session);

    // Try to sync if online
    if (this.isOnline) {
      await this.syncSession(session.id);
    }

    return session;
  }

  /**
   * Add measurement
   */
  async addMeasurement(sessionId: string, measurement: Omit<OfflineMeasurement, 'id' | 'syncStatus' | 'createdAt'>): Promise<void> {
    const m: OfflineMeasurement = {
      ...measurement,
      id: crypto.randomUUID(),
      syncStatus: 'pending',
      createdAt: new Date(),
    };

    await offlineDB.measurements.add(m);

    // Update local session
    const session = await offlineDB.sessions.get(sessionId);
    if (session) {
      const measurements = await this.getLocalMeasurements(sessionId);
      await offlineDB.sessions.update(sessionId, { measurements });
    }

    // Sync if online
    if (this.isOnline) {
      await this.syncMeasurements(sessionId);
    }
  }

  /**
   * Get local measurements for session
   */
  private async getLocalMeasurements(sessionId: string): Promise<any[]> {
    return await offlineDB.measurements
      .where('sessionId')
      .equals(sessionId)
      .toArray();
  }

  /**
   * Network restored handler
   */
  private async handleOnline() {
    console.log('[Offline] Network restored! Starting sync...');
    this.isOnline = true;

    // Sync all pending data
    await this.syncAllPending();

    this.showNotification('✅ Связь восстановлена. Данные синхронизируются...');
  }

  /**
   * Network lost handler
   */
  private handleOffline() {
    console.log('[Offline] Network lost. Switching to offline mode...');
    this.isOnline = false;

    this.showNotification('⚠️ Работаем в офлайн режиме. Данные сохраняются локально.');
  }

  /**
   * Sync all pending data
   */
  async syncAllPending(): Promise<void> {
    if (this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      // 1. Sync sessions
      const pendingSessions = await offlineDB.sessions
        .where('syncStatus')
        .equals('pending')
        .toArray();

      for (const session of pendingSessions) {
        await this.syncSession(session.id);
      }

      // 2. Sync measurements
      const pendingMeasurements = await offlineDB.measurements
        .where('syncStatus')
        .equals('pending')
        .toArray();

      for (const measurement of pendingMeasurements) {
        await this.syncMeasurement(measurement.id);
      }

      console.log(`[Offline] Synced ${pendingSessions.length} sessions, ${pendingMeasurements.length} measurements`);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync single session
   */
  private async syncSession(localId: string): Promise<void> {
    const session = await offlineDB.sessions.get(localId);
    if (!session) return;

    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          id: session.id,
          session_code: session.sessionCode,
          service_type: session.serviceType,
          status: session.status,
          terminal_id: session.terminalId,
          created_at: session.createdAt.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Update local record
      await offlineDB.sessions.update(localId, {
        syncStatus: 'synced',
        syncedAt: new Date(),
        remoteId: data[0]?.id || session.id,
      });

      console.log(`[Offline] Session ${session.sessionCode} synced ✅`);
    } catch (error) {
      console.error(`[Offline] Sync failed for session ${localId}:`, error);

      await offlineDB.sessions.update(localId, {
        syncStatus: 'failed',
        syncError: error instanceof Error ? error.message : 'Unknown error',
      });

      // Retry after 1 minute
      setTimeout(() => this.syncSession(localId), 60000);
    }
  }

  /**
   * Sync single measurement
   */
  private async syncMeasurement(localId: string): Promise<void> {
    const measurement = await offlineDB.measurements.get(localId);
    if (!measurement) return;

    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/thickness_measurements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
        },
        body: JSON.stringify({
          session_id: measurement.sessionId,
          zone_index: measurement.zoneIndex,
          zone_name: measurement.zoneName,
          thickness_microns: measurement.thicknessMicrons,
          status: measurement.status,
          measured_at: measurement.createdAt.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.statusText}`);
      }

      await offlineDB.measurements.update(localId, { syncStatus: 'synced' });
    } catch (error) {
      console.error(`[Offline] Sync failed for measurement ${localId}:`, error);
      await offlineDB.measurements.update(localId, { syncStatus: 'failed' });
    }
  }

  /**
   * Check Supabase connection
   */
  async checkConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'apikey': this.supabaseKey,
        },
      });

      clearTimeout(timeout);

      const wasOffline = !this.isOnline;
      this.isOnline = response.ok;

      if (wasOffline && this.isOnline) {
        await this.handleOnline();
      }

      return this.isOnline;
    } catch (error) {
      this.isOnline = false;
      return false;
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<{ pending: number; synced: number; failed: number }> {
    const pending = await offlineDB.sessions.where('syncStatus').equals('pending').count();
    const synced = await offlineDB.sessions.where('syncStatus').equals('synced').count();
    const failed = await offlineDB.sessions.where('syncStatus').equals('failed').count();

    return { pending, synced, failed };
  }

  /**
   * Show notification (override in UI)
   */
  private showNotification(message: string): void {
    console.log(`[Notification] ${message}`);
    // Override this method in UI layer to show actual notifications
  }

  /**
   * Is online?
   */
  get online(): boolean {
    return this.isOnline;
  }
}
