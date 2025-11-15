import { createClient, SupabaseClient } from '@supabase/supabase-js';
import EventEmitter from 'events';

export interface PresenceState {
  kioskId: string;
  agentEnv: string;
  connectedAt: string;
  lastHeartbeatAt: string;
  activeApps: string[];
  version?: string;
}

export class SupabasePresence extends EventEmitter {
  private client: SupabaseClient;
  private channel: any;
  private state: PresenceState;
  private heartbeatTimer?: NodeJS.Timeout;
  private readonly heartbeatIntervalMs: number;
  private ready = false;

  constructor(opts: { kioskId: string; agentEnv: string; activeAppsProvider: () => string[] }) {
    super();
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase URL/KEY отсутствуют в окружении');
    this.client = createClient(url, key, { auth: { persistSession: false } });
    this.heartbeatIntervalMs = Number(process.env.SUPABASE_PRESENCE_HEARTBEAT_MS || '15000');
    this.state = {
      kioskId: opts.kioskId,
      agentEnv: opts.agentEnv,
      connectedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      activeApps: opts.activeAppsProvider(),
      version: process.env.AGENT_VERSION,
    };
    this.channel = this.client.channel(`presence:kiosk:${opts.kioskId}`);
    this.channel.on('presence', { event: 'sync' }, () => {
      this.emit('presence_sync');
    });
    this.channel.on('broadcast', { event: 'control' }, (payload: any) => {
      this.emit('control', payload); // будущие команды управления
    });
  }

  async init(): Promise<void> {
    await this.channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        try {
          await this.channel.track({ ...this.state });
          this.ready = true;
          this.emit('presence_ready');
          this.startHeartbeat();
        } catch (e: any) {
          this.emit('presence_error', e);
        }
      }
    });
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      if (!this.ready) return;
      try {
        this.state.lastHeartbeatAt = new Date().toISOString();
        await this.channel.track({ ...this.state, activeApps: this.state.activeApps });
        this.emit('presence_heartbeat', { at: this.state.lastHeartbeatAt });
      } catch (e: any) {
        this.emit('presence_error', e);
      }
    }, this.heartbeatIntervalMs);
  }

  updateActiveApps(apps: string[]) {
    this.state.activeApps = apps;
  }

  getState(): PresenceState { return { ...this.state }; }

  async shutdown(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    try { await this.channel.unsubscribe(); } catch {}
  }
}
