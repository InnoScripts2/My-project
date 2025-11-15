import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Gauge, Counter, Registry } from 'prom-client';

export interface PresenceOptions {
  supabaseUrl: string;
  supabaseKey: string; // service role preferred
  clientId: string; // unique id (kiosk id + app name)
  appVersion?: string;
  platform?: string;
  heartbeatIntervalMs?: number;
  staleThresholdMs?: number;
}

interface PresenceMetrics {
  heartbeatTotal: Counter<'status'>;
  heartbeatLatency: Gauge<'phase'>;
  activeClients: Gauge<string>;
  lastError?: Gauge<'type'>;
}

export class AppPresenceService {
  private client: SupabaseClient;
  private opts: Required<PresenceOptions>;
  private timer: NodeJS.Timeout | null = null;
  private metrics: PresenceMetrics;
  private lastBeatStarted = 0;
  private lastHeartbeatAt: string | null = null;
  private lastActiveClientsCount = 0;

  constructor(options: PresenceOptions, registry?: Registry) {
    this.opts = {
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 15000,
      staleThresholdMs: options.staleThresholdMs ?? 60000,
      appVersion: options.appVersion ?? process.env.APP_VERSION ?? 'dev',
      platform: options.platform ?? process.platform,
      ...options,
    };
    this.client = createClient(this.opts.supabaseUrl, this.opts.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const reg = registry;
    this.metrics = {
      heartbeatTotal: new Counter({
        name: 'presence_heartbeat_total',
        help: 'Total heartbeat attempts',
        labelNames: ['status'],
        registers: reg ? [reg] : undefined,
      }),
      heartbeatLatency: new Gauge({
        name: 'presence_heartbeat_latency_ms',
        help: 'Latency of last heartbeat phase',
        labelNames: ['phase'],
        registers: reg ? [reg] : undefined,
      }),
      activeClients: new Gauge({
        name: 'presence_active_clients',
        help: 'Number of active (not stale) clients',
        registers: reg ? [reg] : undefined,
      }),
      lastError: new Gauge({
        name: 'presence_last_error_code',
        help: '1 if last heartbeat ended with error, 0 otherwise',
        labelNames: ['type'],
        registers: reg ? [reg] : undefined,
      }),
    };
  }

  async start(): Promise<void> {
    if (this.timer) return;
    await this.beat();
    this.timer = setInterval(() => {
      this.beat().catch(err => {
        // already recorded inside beat
      });
    }, this.opts.heartbeatIntervalMs).unref();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async beat(): Promise<void> {
    this.lastBeatStarted = Date.now();
    try {
      this.metrics.heartbeatLatency.labels('start').set(0);
      const { error } = await this.client.from('clients').upsert({
        client_id: this.opts.clientId,
        api_key: this.opts.clientId,
        app_version: this.opts.appVersion,
        platform: this.opts.platform,
        status: 'online',
        last_heartbeat: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      }, { onConflict: 'client_id' });
      if (error) throw new Error(error.message);
      const duration = Date.now() - this.lastBeatStarted;
      this.metrics.heartbeatLatency.labels('complete').set(duration);
      this.metrics.heartbeatTotal.labels('ok').inc();
      if (this.metrics.lastError) this.metrics.lastError.labels('heartbeat').set(0);
      this.lastHeartbeatAt = new Date().toISOString();
      await this.refreshActiveClients();
    } catch (err: any) {
      this.metrics.heartbeatTotal.labels('error').inc();
      if (this.metrics.lastError) this.metrics.lastError.labels('heartbeat').set(1);
      this.metrics.heartbeatLatency.labels('error').set(Date.now() - this.lastBeatStarted);
      throw err;
    }
  }

  private async refreshActiveClients(): Promise<void> {
    try {
      const sinceIso = new Date(Date.now() - this.opts.staleThresholdMs).toISOString();
      const { data, error } = await this.client
        .from('clients')
        .select('client_id,last_heartbeat')
        .gte('last_heartbeat', sinceIso);
      if (error) throw new Error(error.message);
      this.metrics.activeClients.set(Array.isArray(data) ? data.length : 0);
      this.lastActiveClientsCount = Array.isArray(data) ? data.length : 0;
    } catch (err) {
      // silent
    }
  }

  async getActiveClients(): Promise<{ client_id: string; last_heartbeat: string }[]> {
    const sinceIso = new Date(Date.now() - this.opts.staleThresholdMs).toISOString();
    const { data, error } = await this.client
      .from('clients')
      .select('client_id,last_heartbeat,status,platform,app_version')
      .gte('last_heartbeat', sinceIso)
      .order('last_heartbeat', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as any[]) || [];
  }

  getState(): { lastHeartbeatAt: string | null; secondsSinceLastHeartbeat?: number; activeClients: number; intervalMs: number } {
    let secondsSince: number | undefined = undefined;
    if (this.lastHeartbeatAt) {
      secondsSince = Math.max(0, (Date.now() - Date.parse(this.lastHeartbeatAt)) / 1000);
    }
    return {
      lastHeartbeatAt: this.lastHeartbeatAt,
      secondsSinceLastHeartbeat: secondsSince,
      activeClients: this.lastActiveClientsCount,
      intervalMs: this.opts.heartbeatIntervalMs,
    };
  }
}

export function createPresenceService(registry?: Registry): AppPresenceService | null {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
  if (!url || !key) return null;
  const kioskId = process.env.KIOSK_ID || 'local-kiosk';
  const appName = 'kiosk-agent';
  const clientId = `${kioskId}:${appName}`;
  const svc = new AppPresenceService({
    supabaseUrl: url,
    supabaseKey: key,
    clientId,
  }, registry);
  return svc;
}
