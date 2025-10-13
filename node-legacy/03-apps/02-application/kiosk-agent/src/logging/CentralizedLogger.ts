/**
 * M21: Встроенный внутренний терминал + тотальный лог ошибок
 * S201-S215: Централизованный логгер с каналами, уровнями, маскированием
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogChannel = 'obd' | 'thk' | 'payments' | 'report' | 'locks' | 'infra' | 'general';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  channel: LogChannel;
  message: string;
  source?: string;
  requestId?: string;
  sessionId?: string;
  error?: unknown;
  context?: Record<string, unknown>;
  masked?: boolean;
}

export interface CentralizedLoggerOptions {
  maxEntries?: number;
  rotateAfterMs?: number;
  maskPatterns?: RegExp[];
  enableConsole?: boolean;
  minLevel?: LogLevel;
}

const DEFAULT_MASK_PATTERNS = [
  // Маскирует email адреса
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Маскирует телефоны (простой паттерн)
  /\b\d{10,11}\b/g,
  // Маскирует потенциальные токены/ключи (длинные строки hex или base64)
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\b[A-Za-z0-9+/=]{40,}\b/g,
];

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/**
 * S201-S204: Центральный логгер с каналами, уровнями, тегами, JSON форматом
 */
export class CentralizedLogger {
  private readonly entries: LogEntry[] = [];
  private readonly maxEntries: number;
  private readonly rotateAfterMs: number;
  private readonly maskPatterns: RegExp[];
  private readonly enableConsole: boolean;
  private readonly minLevel: LogLevel;
  private lastRotation: number = Date.now();
  private entryCounter = 0;

  constructor(options: CentralizedLoggerOptions = {}) {
    this.maxEntries = options.maxEntries ?? 10000;
    this.rotateAfterMs = options.rotateAfterMs ?? 24 * 60 * 60 * 1000; // 24 часа
    this.maskPatterns = options.maskPatterns ?? DEFAULT_MASK_PATTERNS;
    this.enableConsole = options.enableConsole ?? true;
    this.minLevel = options.minLevel ?? 'debug';
  }

  /**
   * S202, S213: Логирование с каналом и привязкой к запросам (traceId)
   */
  log(
    level: LogLevel,
    channel: LogChannel,
    message: string,
    options?: {
      source?: string;
      requestId?: string;
      sessionId?: string;
      error?: unknown;
      context?: Record<string, unknown>;
    }
  ): void {
    // Проверяем минимальный уровень
    if (LEVEL_WEIGHTS[level] < LEVEL_WEIGHTS[this.minLevel]) {
      return;
    }

    // S214: Маскирование секретов в логах
    const maskedMessage = this.maskSensitiveData(message);
    const maskedContext = options?.context
      ? this.maskObjectData(options.context)
      : undefined;

    const entry: LogEntry = {
      id: this.generateEntryId(),
      timestamp: new Date().toISOString(),
      level,
      channel,
      message: maskedMessage,
      source: options?.source,
      requestId: options?.requestId,
      sessionId: options?.sessionId,
      error: options?.error,
      context: maskedContext,
      masked: maskedMessage !== message || maskedContext !== options?.context,
    };

    this.addEntry(entry);

    // Вывод в консоль (опционально)
    if (this.enableConsole) {
      this.logToConsole(entry);
    }

    // S203: Ротация логов
    this.maybeRotate();
  }

  debug(channel: LogChannel, message: string, options?: Parameters<typeof this.log>[3]): void {
    this.log('debug', channel, message, options);
  }

  info(channel: LogChannel, message: string, options?: Parameters<typeof this.log>[3]): void {
    this.log('info', channel, message, options);
  }

  warn(channel: LogChannel, message: string, options?: Parameters<typeof this.log>[3]): void {
    this.log('warn', channel, message, options);
  }

  error(channel: LogChannel, message: string, options?: Parameters<typeof this.log>[3]): void {
    this.log('error', channel, message, options);
  }

  fatal(channel: LogChannel, message: string, options?: Parameters<typeof this.log>[3]): void {
    this.log('fatal', channel, message, options);
  }

  /**
   * S206: Получение логов с фильтрами (tail, уровень, канал, поиск)
   */
  query(options?: {
    level?: LogLevel;
    channel?: LogChannel;
    limit?: number;
    search?: string;
    since?: string;
    requestId?: string;
    sessionId?: string;
  }): LogEntry[] {
    let filtered = [...this.entries];

    if (options?.level) {
      const minWeight = LEVEL_WEIGHTS[options.level];
      filtered = filtered.filter((e) => LEVEL_WEIGHTS[e.level] >= minWeight);
    }

    if (options?.channel) {
      filtered = filtered.filter((e) => e.channel === options.channel);
    }

    if (options?.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.message.toLowerCase().includes(searchLower) ||
          e.source?.toLowerCase().includes(searchLower)
      );
    }

    if (options?.since) {
      filtered = filtered.filter((e) => e.timestamp >= options.since!);
    }

    if (options?.requestId) {
      filtered = filtered.filter((e) => e.requestId === options.requestId);
    }

    if (options?.sessionId) {
      filtered = filtered.filter((e) => e.sessionId === options.sessionId);
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * Получить последние N записей (tail)
   */
  tail(count: number = 100): LogEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Получить статистику по логам
   */
  getStats(): {
    totalEntries: number;
    byLevel: Record<LogLevel, number>;
    byChannel: Record<LogChannel, number>;
    oldestEntry?: string;
    newestEntry?: string;
  } {
    const byLevel: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      fatal: 0,
    };
    const byChannel: Record<LogChannel, number> = {
      obd: 0,
      thk: 0,
      payments: 0,
      report: 0,
      locks: 0,
      infra: 0,
      general: 0,
    };

    for (const entry of this.entries) {
      byLevel[entry.level]++;
      byChannel[entry.channel]++;
    }

    return {
      totalEntries: this.entries.length,
      byLevel,
      byChannel,
      oldestEntry: this.entries[0]?.timestamp,
      newestEntry: this.entries[this.entries.length - 1]?.timestamp,
    };
  }

  /**
   * Очистить все логи
   */
  clear(): void {
    this.entries.length = 0;
    this.entryCounter = 0;
  }

  /**
   * S214: Маскирование чувствительных данных в строке
   */
  private maskSensitiveData(text: string): string {
    let masked = text;
    for (const pattern of this.maskPatterns) {
      masked = masked.replace(pattern, '***');
    }
    return masked;
  }

  /**
   * Маскирование данных в объекте
   */
  private maskObjectData(obj: Record<string, unknown>): Record<string, unknown> {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        masked[key] = this.maskSensitiveData(value);
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskObjectData(value as Record<string, unknown>);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  private addEntry(entry: LogEntry): void {
    this.entries.push(entry);

    // S203: Ограничение размера
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  private generateEntryId(): string {
    this.entryCounter++;
    return `log_${Date.now()}_${this.entryCounter}`;
  }

  /**
   * S203: Ротация логов по времени
   */
  private maybeRotate(): void {
    const now = Date.now();
    if (now - this.lastRotation > this.rotateAfterMs) {
      // В реальной системе здесь был бы экспорт в файл/БД
      // Для простоты просто отмечаем время ротации
      this.lastRotation = now;
      
      // Можно сохранить старые записи в архив
      if (this.entries.length > this.maxEntries / 2) {
        const toArchive = this.entries.splice(0, this.entries.length / 2);
        // В реальности: writeArchive(toArchive)
        console.log(`[CentralizedLogger] Rotated ${toArchive.length} entries`);
      }
    }
  }

  private logToConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.channel}]`;
    const message = entry.source ? `${prefix} (${entry.source}): ${entry.message}` : `${prefix} ${entry.message}`;

    switch (entry.level) {
      case 'debug':
        console.debug(message, entry.context || '');
        break;
      case 'info':
        console.log(message, entry.context || '');
        break;
      case 'warn':
        console.warn(message, entry.context || '');
        break;
      case 'error':
      case 'fatal':
        console.error(message, entry.error || entry.context || '');
        break;
    }
  }
}

/**
 * Singleton инстанс централизованного логгера
 */
export const centralizedLogger = new CentralizedLogger({
  maxEntries: parseInt(process.env.LOG_MAX_ENTRIES ?? '10000', 10),
  rotateAfterMs: parseInt(process.env.LOG_ROTATE_AFTER_MS ?? String(24 * 60 * 60 * 1000), 10),
  enableConsole: process.env.LOG_ENABLE_CONSOLE !== 'false',
  minLevel: (process.env.LOG_MIN_LEVEL as LogLevel) ?? 'info',
});
