/**
 * S210-S211: Автоматическая детекция аномалий в логах (паттерны сбоев)
 * с созданием алертов
 */
/**
 * Встроенные детекторы аномалий
 */
export const BUILT_IN_PATTERNS = [
    {
        id: 'error_storm',
        name: 'Шторм ошибок',
        description: 'Более 10 ошибок за 60 секунд',
        severity: 'critical',
        detector: (entries, timeWindowMs) => {
            const threshold = 10;
            const windowMs = 60000;
            const now = Date.now();
            const cutoff = new Date(now - windowMs).toISOString();
            const recentErrors = entries.filter((e) => (e.level === 'error' || e.level === 'fatal') && e.timestamp >= cutoff);
            if (recentErrors.length >= threshold) {
                return {
                    patternId: 'error_storm',
                    patternName: 'Шторм ошибок',
                    severity: 'critical',
                    timestamp: new Date().toISOString(),
                    description: `Обнаружено ${recentErrors.length} ошибок за последние 60 секунд`,
                    affectedEntries: recentErrors.slice(-threshold),
                    metrics: { errorCount: recentErrors.length },
                };
            }
            return null;
        },
    },
    {
        id: 'connection_failures',
        name: 'Частые сбои подключения',
        description: 'Более 5 сбоев OBD подключения за 5 минут',
        severity: 'high',
        detector: (entries, timeWindowMs) => {
            const threshold = 5;
            const windowMs = 5 * 60000;
            const now = Date.now();
            const cutoff = new Date(now - windowMs).toISOString();
            const connectionFailures = entries.filter((e) => e.channel === 'obd' &&
                (e.level === 'error' || e.level === 'warn') &&
                e.timestamp >= cutoff &&
                (e.message.toLowerCase().includes('connection') ||
                    e.message.toLowerCase().includes('подключени')));
            if (connectionFailures.length >= threshold) {
                return {
                    patternId: 'connection_failures',
                    patternName: 'Частые сбои подключения',
                    severity: 'high',
                    timestamp: new Date().toISOString(),
                    description: `${connectionFailures.length} сбоев подключения за последние 5 минут`,
                    affectedEntries: connectionFailures,
                    metrics: { failureCount: connectionFailures.length },
                };
            }
            return null;
        },
    },
    {
        id: 'payment_delays',
        name: 'Задержки платежей',
        description: 'Более 3 платежей со статусом pending > 90 секунд',
        severity: 'medium',
        detector: (entries, timeWindowMs) => {
            const threshold = 3;
            const windowMs = 5 * 60000;
            const now = Date.now();
            const cutoff = new Date(now - windowMs).toISOString();
            const paymentWarnings = entries.filter((e) => e.channel === 'payments' &&
                e.level === 'warn' &&
                e.timestamp >= cutoff &&
                e.message.toLowerCase().includes('pending'));
            if (paymentWarnings.length >= threshold) {
                return {
                    patternId: 'payment_delays',
                    patternName: 'Задержки платежей',
                    severity: 'medium',
                    timestamp: new Date().toISOString(),
                    description: `${paymentWarnings.length} платежей с задержкой подтверждения`,
                    affectedEntries: paymentWarnings,
                    metrics: { delayedPayments: paymentWarnings.length },
                };
            }
            return null;
        },
    },
    {
        id: 'repeated_same_error',
        name: 'Повторяющаяся ошибка',
        description: 'Одна и та же ошибка повторяется более 5 раз за 10 минут',
        severity: 'high',
        detector: (entries, timeWindowMs) => {
            const threshold = 5;
            const windowMs = 10 * 60000;
            const now = Date.now();
            const cutoff = new Date(now - windowMs).toISOString();
            const recentErrors = entries.filter((e) => (e.level === 'error' || e.level === 'fatal') && e.timestamp >= cutoff);
            // Группируем по сообщению
            const errorCounts = new Map();
            for (const error of recentErrors) {
                const key = error.message.substring(0, 100); // первые 100 символов как ключ
                if (!errorCounts.has(key)) {
                    errorCounts.set(key, []);
                }
                errorCounts.get(key).push(error);
            }
            // Ищем повторяющиеся ошибки
            for (const [message, errors] of errorCounts.entries()) {
                if (errors.length >= threshold) {
                    return {
                        patternId: 'repeated_same_error',
                        patternName: 'Повторяющаяся ошибка',
                        severity: 'high',
                        timestamp: new Date().toISOString(),
                        description: `Ошибка "${message.substring(0, 50)}..." повторилась ${errors.length} раз`,
                        affectedEntries: errors,
                        metrics: { repeatCount: errors.length },
                    };
                }
            }
            return null;
        },
    },
    {
        id: 'throttle_warning',
        name: 'Превышение частоты запросов',
        description: 'Более 100 запросов к одному каналу за минуту',
        severity: 'medium',
        detector: (entries, timeWindowMs) => {
            const threshold = 100;
            const windowMs = 60000;
            const now = Date.now();
            const cutoff = new Date(now - windowMs).toISOString();
            const recentEntries = entries.filter((e) => e.timestamp >= cutoff);
            // Считаем по каналам
            const channelCounts = new Map();
            for (const entry of recentEntries) {
                channelCounts.set(entry.channel, (channelCounts.get(entry.channel) ?? 0) + 1);
            }
            for (const [channel, count] of channelCounts.entries()) {
                if (count >= threshold) {
                    const channelEntries = recentEntries.filter((e) => e.channel === channel);
                    return {
                        patternId: 'throttle_warning',
                        patternName: 'Превышение частоты запросов',
                        severity: 'medium',
                        timestamp: new Date().toISOString(),
                        description: `Канал "${channel}" получил ${count} запросов за минуту`,
                        affectedEntries: channelEntries.slice(-20),
                        metrics: { requestCount: count },
                    };
                }
            }
            return null;
        },
    },
];
/**
 * Детектор аномалий
 */
export class AnomalyDetector {
    constructor(options) {
        this.detectedAnomalies = [];
        this.patterns = options?.patterns ?? BUILT_IN_PATTERNS;
        this.maxAnomalies = options?.maxAnomalies ?? 1000;
    }
    /**
     * Анализирует логи на наличие аномалий
     */
    detect(entries, timeWindowMs = 10 * 60000) {
        const detected = [];
        for (const pattern of this.patterns) {
            const match = pattern.detector(entries, timeWindowMs);
            if (match) {
                detected.push(match);
                this.recordAnomaly(match);
            }
        }
        return detected;
    }
    /**
     * Возвращает все обнаруженные аномалии
     */
    getDetectedAnomalies(options) {
        let filtered = [...this.detectedAnomalies];
        if (options?.since) {
            filtered = filtered.filter((a) => a.timestamp >= options.since);
        }
        if (options?.severity) {
            filtered = filtered.filter((a) => a.severity === options.severity);
        }
        return filtered;
    }
    /**
     * Очищает историю аномалий
     */
    clearAnomalies() {
        this.detectedAnomalies.length = 0;
    }
    recordAnomaly(anomaly) {
        this.detectedAnomalies.push(anomaly);
        if (this.detectedAnomalies.length > this.maxAnomalies) {
            this.detectedAnomalies.shift();
        }
    }
}
