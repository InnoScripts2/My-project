/**
 * Heartbeat Service
 *
 * Отправляет регулярные heartbeat сигналы в Supabase для индикации активности клиента.
 * Обновляет last_heartbeat timestamp и статус клиента.
 */

import { getSupabase } from './supabase.js';
import { UpdateAgentConfig } from '../config.js';

export class HeartbeatService {
  private intervalId: NodeJS.Timeout | null = null;
  private config: UpdateAgentConfig;

  constructor(config: UpdateAgentConfig) {
    this.config = config;
  }

  /**
   * Запустить отправку heartbeat
   */
  start() {
    if (this.intervalId) {
      console.warn('Heartbeat already running');
      return;
    }

    console.log(`Starting heartbeat service (interval: ${this.config.heartbeatIntervalMs}ms)`);

    // Отправить немедленно
    this.sendHeartbeat();

    // Запустить периодическую отправку
    this.intervalId = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Остановить отправку heartbeat
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Heartbeat service stopped');
    }
  }

  /**
   * Отправить heartbeat в Supabase
   */
  private async sendHeartbeat() {
    try {
      const supabase = getSupabase();
      const now = new Date().toISOString();

      const { error } = await supabase
        .from('clients')
        .update({
          last_heartbeat: now,
          last_seen: now,
        })
        .eq('client_id', this.config.clientId);

      if (error) {
        console.error('Failed to send heartbeat:', error.message);
      } else {
        console.log(`Heartbeat sent at ${now}`);
      }
    } catch (error) {
      console.error('Heartbeat error:', error);
    }
  }
}
