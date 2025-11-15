/**
 * Error Recovery Handler for OBD-II Diagnostics
 * Analyzes errors and provides recovery strategies
 */
export var ErrorType;
(function (ErrorType) {
    ErrorType["CONNECTION"] = "CONNECTION";
    ErrorType["SCAN"] = "SCAN";
    ErrorType["PAYMENT"] = "PAYMENT";
    ErrorType["REPORT"] = "REPORT";
})(ErrorType || (ErrorType = {}));
export var ErrorCode;
(function (ErrorCode) {
    // Connection errors
    ErrorCode["ADAPTER_NOT_FOUND"] = "ADAPTER_NOT_FOUND";
    ErrorCode["BLUETOOTH_DISABLED"] = "BLUETOOTH_DISABLED";
    ErrorCode["CONNECTION_TIMEOUT"] = "CONNECTION_TIMEOUT";
    ErrorCode["CONNECTION_LOST"] = "CONNECTION_LOST";
    // Scan errors
    ErrorCode["PROTOCOL_ERROR"] = "PROTOCOL_ERROR";
    ErrorCode["SCAN_TIMEOUT"] = "SCAN_TIMEOUT";
    ErrorCode["PARTIAL_DATA"] = "PARTIAL_DATA";
    ErrorCode["ECU_NOT_RESPONDING"] = "ECU_NOT_RESPONDING";
    // Payment errors
    ErrorCode["PAYMENT_DECLINED"] = "PAYMENT_DECLINED";
    ErrorCode["PAYMENT_TIMEOUT"] = "PAYMENT_TIMEOUT";
    ErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    // Report errors
    ErrorCode["PDF_GENERATION_FAILED"] = "PDF_GENERATION_FAILED";
    ErrorCode["DELIVERY_FAILED"] = "DELIVERY_FAILED";
    ErrorCode["TEMPLATE_ERROR"] = "TEMPLATE_ERROR";
})(ErrorCode || (ErrorCode = {}));
export var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["LOW"] = "LOW";
    ErrorSeverity["MEDIUM"] = "MEDIUM";
    ErrorSeverity["HIGH"] = "HIGH";
    ErrorSeverity["CRITICAL"] = "CRITICAL";
})(ErrorSeverity || (ErrorSeverity = {}));
export class ErrorRecoveryHandler {
    static handleConnectionError(context, error) {
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
    static handleScanError(context, error) {
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
    static handlePaymentError(context, error) {
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
    static handleReportError(context, error) {
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
    static logError(error, context, severity = ErrorSeverity.MEDIUM) {
        const structuredError = {
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
    static getLogLevel(severity) {
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
