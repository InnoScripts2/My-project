/**
 * Error Recovery Handler for OBD-II Diagnostics
 * Analyzes errors and provides recovery strategies
 */

export enum ErrorType {
  CONNECTION = 'CONNECTION',
  SCAN = 'SCAN',
  PAYMENT = 'PAYMENT',
  REPORT = 'REPORT',
}

export enum ErrorCode {
  // Connection errors
  ADAPTER_NOT_FOUND = 'ADAPTER_NOT_FOUND',
  BLUETOOTH_DISABLED = 'BLUETOOTH_DISABLED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_LOST = 'CONNECTION_LOST',
  
  // Scan errors
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',
  SCAN_TIMEOUT = 'SCAN_TIMEOUT',
  PARTIAL_DATA = 'PARTIAL_DATA',
  ECU_NOT_RESPONDING = 'ECU_NOT_RESPONDING',
  
  // Payment errors
  PAYMENT_DECLINED = 'PAYMENT_DECLINED',
  PAYMENT_TIMEOUT = 'PAYMENT_TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  
  // Report errors
  PDF_GENERATION_FAILED = 'PDF_GENERATION_FAILED',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
  TEMPLATE_ERROR = 'TEMPLATE_ERROR',
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface RecoveryStrategy {
  retry: boolean;
  maxRetries: number;
  retryDelay?: number;
  suggestions: string[];
  escalate: boolean;
  fallbackAction?: string;
}

export interface ErrorContext {
  type: ErrorType;
  code: ErrorCode;
  message: string;
  attemptNumber?: number;
  sessionId?: string;
  vehicleData?: {
    make?: string;
    model?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface StructuredError {
  timestamp: string;
  type: ErrorType;
  code: ErrorCode;
  severity: ErrorSeverity;
  message: string;
  context: ErrorContext;
  stack?: string;
}

export class ErrorRecoveryHandler {
  static handleConnectionError(context: ErrorContext, error: Error): RecoveryStrategy {
    const code = context.code;

    switch (code) {
      case ErrorCode.ADAPTER_NOT_FOUND:
        return {
          retry: true,
          maxRetries: 3,
          retryDelay: 5000,
          suggestions: [
            'Убедитесь, что адаптер включен',
            'Проверьте, что Bluetooth активирован на терминале',
            'Переместите адаптер ближе к терминалу',
            'Перезапустите адаптер (отключите и подключите заново)',
          ],
          escalate: false,
        };

      case ErrorCode.BLUETOOTH_DISABLED:
        return {
          retry: false,
          maxRetries: 0,
          suggestions: [
            'Bluetooth отключен на терминале',
            'Включите Bluetooth в настройках системы',
            'Перезагрузите терминал, если проблема сохраняется',
          ],
          escalate: true,
        };

      case ErrorCode.CONNECTION_TIMEOUT:
        return {
          retry: true,
          maxRetries: 3,
          retryDelay: 5000,
          suggestions: [
            'Адаптер не отвечает',
            'Проверьте уровень заряда адаптера',
            'Убедитесь, что адаптер правильно подключен к разъему OBD-II',
            'Попробуйте переподключить адаптер',
          ],
          escalate: false,
        };

      case ErrorCode.CONNECTION_LOST:
        return {
          retry: true,
          maxRetries: 3,
          retryDelay: 3000,
          suggestions: [
            'Соединение с адаптером потеряно',
            'Проверьте расположение адаптера',
            'Убедитесь, что зажигание автомобиля включено',
          ],
          escalate: false,
          fallbackAction: 'reconnect',
        };

      default:
        return {
          retry: true,
          maxRetries: 2,
          retryDelay: 5000,
          suggestions: [
            'Произошла неизвестная ошибка подключения',
            'Попробуйте переподключить адаптер',
          ],
          escalate: false,
        };
    }
  }

  static handleScanError(context: ErrorContext, error: Error): RecoveryStrategy {
    const code = context.code;

    switch (code) {
      case ErrorCode.CONNECTION_LOST:
        return {
          retry: true,
          maxRetries: 2,
          retryDelay: 5000,
          suggestions: [
            'Связь с автомобилем потеряна во время сканирования',
            'Убедитесь, что зажигание включено',
            'Проверьте надежность подключения адаптера',
          ],
          escalate: false,
          fallbackAction: 'reconnect',
        };

      case ErrorCode.PROTOCOL_ERROR:
        return {
          retry: true,
          maxRetries: 2,
          retryDelay: 3000,
          suggestions: [
            'Ошибка протокола связи с автомобилем',
            'Адаптер попытается использовать альтернативный протокол',
            'Убедитесь, что автомобиль совместим с OBD-II',
          ],
          escalate: false,
          fallbackAction: 'try_alternative_protocol',
        };

      case ErrorCode.SCAN_TIMEOUT:
        return {
          retry: true,
          maxRetries: 2,
          retryDelay: 5000,
          suggestions: [
            'Сканирование заняло слишком много времени',
            'ЭБУ автомобиля может не отвечать',
            'Попробуйте выключить и включить зажигание',
          ],
          escalate: false,
        };

      case ErrorCode.PARTIAL_DATA:
        return {
          retry: false,
          maxRetries: 0,
          suggestions: [
            'Получены частичные данные диагностики',
            'Данные будут сохранены',
            'Рекомендуется повторить сканирование позже',
          ],
          escalate: false,
          fallbackAction: 'save_partial',
        };

      case ErrorCode.ECU_NOT_RESPONDING:
        return {
          retry: true,
          maxRetries: 1,
          retryDelay: 10000,
          suggestions: [
            'ЭБУ не отвечает на запросы',
            'Выключите и включите зажигание',
            'Подождите 10-15 секунд перед повторной попыткой',
          ],
          escalate: false,
        };

      default:
        return {
          retry: true,
          maxRetries: 1,
          retryDelay: 5000,
          suggestions: [
            'Произошла ошибка во время сканирования',
            'Попробуйте повторить операцию',
          ],
          escalate: false,
        };
    }
  }

  static handlePaymentError(context: ErrorContext, error: Error): RecoveryStrategy {
    const code = context.code;
    const attemptNumber = context.attemptNumber || 1;

    switch (code) {
      case ErrorCode.PAYMENT_DECLINED:
        return {
          retry: attemptNumber < 3,
          maxRetries: 3,
          retryDelay: 2000,
          suggestions: [
            'Оплата отклонена',
            'Проверьте данные карты',
            'Убедитесь, что на карте достаточно средств',
            'Попробуйте другую карту',
          ],
          escalate: attemptNumber >= 3,
        };

      case ErrorCode.NETWORK_ERROR:
        return {
          retry: true,
          maxRetries: 5,
          retryDelay: 2000,
          suggestions: [
            'Ошибка сети при обработке платежа',
            'Проверьте подключение к интернету',
            'Повторная попытка через несколько секунд',
          ],
          escalate: false,
          fallbackAction: 'exponential_backoff',
        };

      case ErrorCode.PAYMENT_TIMEOUT:
        return {
          retry: true,
          maxRetries: 3,
          retryDelay: 3000,
          suggestions: [
            'Превышено время ожидания подтверждения оплаты',
            'Проверяем статус платежа',
            'Если оплата прошла, результаты будут разблокированы',
          ],
          escalate: false,
          fallbackAction: 'check_status',
        };

      default:
        return {
          retry: true,
          maxRetries: 2,
          retryDelay: 3000,
          suggestions: [
            'Произошла ошибка при обработке платежа',
            'Повторите попытку',
          ],
          escalate: false,
        };
    }
  }

  static handleReportError(context: ErrorContext, error: Error): RecoveryStrategy {
    const code = context.code;

    switch (code) {
      case ErrorCode.PDF_GENERATION_FAILED:
        return {
          retry: true,
          maxRetries: 2,
          retryDelay: 2000,
          suggestions: [
            'Не удалось создать PDF-отчет',
            'Попытка использовать альтернативный формат',
          ],
          escalate: false,
          fallbackAction: 'html_fallback',
        };

      case ErrorCode.DELIVERY_FAILED:
        return {
          retry: true,
          maxRetries: 3,
          retryDelay: 5000,
          suggestions: [
            'Не удалось отправить отчет',
            'Отчет будет сохранен локально',
            'Повторная отправка в фоновом режиме',
          ],
          escalate: false,
          fallbackAction: 'background_retry',
        };

      case ErrorCode.TEMPLATE_ERROR:
        return {
          retry: true,
          maxRetries: 1,
          retryDelay: 1000,
          suggestions: [
            'Ошибка шаблона отчета',
            'Использование базового шаблона',
          ],
          escalate: false,
          fallbackAction: 'basic_template',
        };

      default:
        return {
          retry: true,
          maxRetries: 1,
          retryDelay: 2000,
          suggestions: [
            'Произошла ошибка при генерации отчета',
            'Попытка повтора',
          ],
          escalate: false,
        };
    }
  }

  static logError(
    error: Error,
    context: ErrorContext,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ): StructuredError {
    const structuredError: StructuredError = {
      timestamp: new Date().toISOString(),
      type: context.type,
      code: context.code,
      severity,
      message: context.message || error.message,
      context,
      stack: process.env.AGENT_ENV === 'DEV' ? error.stack : undefined,
    };

    const logLevel = this.getLogLevel(severity);
    console[logLevel](JSON.stringify(structuredError));

    return structuredError;
  }

  private static getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
        return 'info';
    }
  }
}
