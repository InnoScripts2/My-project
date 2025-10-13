/**
 * Модуль логирования для устройств
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: any;
}

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  correlationId?: string;
}

export class DeviceLogger {
  constructor(
    private readonly deviceType: string,
    private readonly correlationId?: string
  ) {}

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const logEntry: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      message: `[${this.deviceType}] ${message}`,
      context,
      correlationId: this.correlationId,
    };

    const logFn = level === 'error' ? console.error : console.log;
    logFn(JSON.stringify(logEntry));
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.LOG_LEVEL === 'debug' || process.env.AGENT_ENV === 'DEV') {
      this.log('debug', message, context);
    }
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  withCorrelationId(correlationId: string): DeviceLogger {
    return new DeviceLogger(this.deviceType, correlationId);
  }
}

export function createLogger(deviceType: string, correlationId?: string): DeviceLogger {
  return new DeviceLogger(deviceType, correlationId);
}
