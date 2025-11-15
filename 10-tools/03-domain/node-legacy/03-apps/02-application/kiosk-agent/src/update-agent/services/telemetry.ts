/**
 * Telemetry Service
 *
 * Отправляет логи и телеметрию в Supabase.
 * Буферизует логи и отправляет батчами для оптимизации.
 */

import { getSupabase } from './supabase.js';
import { UpdateAgentConfig } from '../config.js';

export type LogLevel = 'info' | 'warning' | 'error' | 'critical';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  timestamp: string;
}

export class TelemetryService {
  private config: UpdateAgentConfig;
  private logBuffer: LogEntry[] = [];
  private flushIntervalId: NodeJS.Timeout | null = null;
  private readonly maxBufferSize = 50;
  private readonly flushIntervalMs = 10000; // 10 секунд

  constructor(config: UpdateAgentConfig) {
    this.config = config;
  }

  /**
   * Запустить telemetry service
   */
  start() {
    console.log('Starting telemetry service');

    // Периодический flush буфера
    this.flushIntervalId = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  /**
   * Остановить telemetry service
   */
  async stop() {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }

    // Финальный flush
    await this.flush();
    console.log('Telemetry service stopped');
  }

  /**
   * Записать лог
   */
  log(level: LogLevel, message: string, context?: Record<string, any>) {
    const entry: LogEntry = {
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
    };

    this.logBuffer.push(entry);

    // Также выводим в console
    const logFn = level === 'error' || level === 'critical' ? console.error : console.log;
    logFn(`[${level.toUpperCase()}] ${message}`, context || '');

    // Flush если буфер заполнен
    if (this.logBuffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  /**
   * Отправить все логи из буфера в Supabase
   */
  private async flush() {
    if (this.logBuffer.length === 0) {
      return;
    }

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    try {
      const supabase = getSupabase();

      // Получить client UUID (не client_id строку)
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('client_id', this.config.clientId)
        .single();

      if (!client) {
        console.error('Client not found, cannot send telemetry');
        return;
      }

      const records = logsToSend.map(log => ({
        client_id: client.id,
        log_level: log.level,
        message: log.message,
        context: log.context || {},
        created_at: log.timestamp,
      }));

      const { error } = await supabase
        .from('telemetry_logs')
        .insert(records);

      if (error) {
        console.error('Failed to send telemetry logs:', error.message);
        // Вернуть логи обратно в буфер при ошибке
        this.logBuffer.unshift(...logsToSend);
      } else {
        console.log(`Sent ${records.length} telemetry logs`);
      }
    } catch (error) {
      console.error('Telemetry flush error:', error);
      // Вернуть логи обратно в буфер
      this.logBuffer.unshift(...logsToSend);
    }
  }
}
