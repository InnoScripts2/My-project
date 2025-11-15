/**
 * Облачное хранилище на основе Supabase
 *
 * Используется для:
 * - Синхронизация сессий (опционально)
 * - Отправка телеметрии (логи, метрики)
 * - Хранение отчётов в Storage
 * - Получение конфигурации (feature flags)
 *
 * Features:
 * - Exponential backoff retry with jitter
 * - Circuit breaker pattern
 * - Batching with overflow protection
 * - Comprehensive Prometheus metrics
 */
import { createClient } from '@supabase/supabase-js';
import { Counter, Histogram, Gauge } from 'prom-client';
var CircuitState;
(function (CircuitState) {
    CircuitState["CLOSED"] = "CLOSED";
    CircuitState["OPEN"] = "OPEN";
    CircuitState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitState || (CircuitState = {}));
class CircuitBreaker {
    constructor(config) {
        this.config = config;
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.lastFailureTime = 0;
        this.halfOpenAttempts = 0;
    }
    shouldAttempt() {
        if (this.state === CircuitState.CLOSED) {
            return true;
        }
        if (this.state === CircuitState.OPEN) {
            if (Date.now() - this.lastFailureTime >= this.config.recoveryTimeoutMs) {
                this.state = CircuitState.HALF_OPEN;
                this.halfOpenAttempts = 0;
                return true;
            }
            return false;
        }
        if (this.state === CircuitState.HALF_OPEN) {
            return this.halfOpenAttempts < this.config.halfOpenMaxRequests;
        }
        return false;
    }
    recordSuccess() {
        const previousState = this.state;
        if (this.state === CircuitState.HALF_OPEN) {
            this.state = CircuitState.CLOSED;
            this.failureCount = 0;
        }
        else if (this.state === CircuitState.CLOSED) {
            this.failureCount = 0;
        }
        return previousState;
    }
    recordFailure() {
        const previousState = this.state;
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.state === CircuitState.HALF_OPEN) {
            this.state = CircuitState.OPEN;
            this.halfOpenAttempts = 0;
        }
        else if (this.state === CircuitState.CLOSED && this.failureCount >= this.config.failureThreshold) {
            this.state = CircuitState.OPEN;
        }
        return previousState;
    }
    getState() {
        return this.state;
    }
    reset() {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.lastFailureTime = 0;
        this.halfOpenAttempts = 0;
    }
}
export class SupabaseStore {
    constructor(supabaseUrl, supabaseKey, registry) {
        this.batchQueue = [];
        this.batchTimer = null;
        this.BATCH_SIZE = 50;
        this.BATCH_INTERVAL_MS = 30000;
        this.MAX_QUEUE_SIZE = 1000;
        this.retryConfig = {
            maxAttempts: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            multiplier: 2,
            jitterPercent: 20
        };
        this.forceFlushOnError = false;
        this.client = createClient(supabaseUrl, supabaseKey);
        this.circuitBreaker = new CircuitBreaker({
            failureThreshold: 5,
            recoveryTimeoutMs: 60000,
            halfOpenMaxRequests: 1
        });
        if (registry) {
            this.metrics = {
                operationsTotal: new Counter({
                    name: 'supabase_operations_total',
                    help: 'Total number of Supabase operations',
                    labelNames: ['operation', 'status'],
                    registers: [registry],
                }),
                operationDuration: new Histogram({
                    name: 'supabase_operation_duration_seconds',
                    help: 'Duration of Supabase operations in seconds',
                    labelNames: ['operation'],
                    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
                    registers: [registry],
                }),
                retryAttempts: new Counter({
                    name: 'supabase_retry_attempts_total',
                    help: 'Total number of retry attempts',
                    labelNames: ['operation'],
                    registers: [registry],
                }),
                circuitBreakerStateChanges: new Counter({
                    name: 'supabase_circuit_breaker_state_changes_total',
                    help: 'Total circuit breaker state changes',
                    labelNames: ['from_state', 'to_state'],
                    registers: [registry],
                }),
                telemetryLogsDropped: new Counter({
                    name: 'supabase_telemetry_logs_dropped_total',
                    help: 'Total telemetry logs dropped due to overflow',
                    registers: [registry],
                }),
                telemetryQueueSize: new Gauge({
                    name: 'supabase_telemetry_queue_size',
                    help: 'Current telemetry queue size',
                    registers: [registry],
                }),
                circuitBreakerState: new Gauge({
                    name: 'supabase_circuit_breaker_state',
                    help: 'Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
                    registers: [registry],
                }),
            };
        }
        else {
            this.metrics = {
                operationsTotal: new Counter({
                    name: 'supabase_operations_total',
                    help: 'Total number of Supabase operations',
                    labelNames: ['operation', 'status'],
                }),
                operationDuration: new Histogram({
                    name: 'supabase_operation_duration_seconds',
                    help: 'Duration of Supabase operations in seconds',
                    labelNames: ['operation'],
                    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
                }),
                retryAttempts: new Counter({
                    name: 'supabase_retry_attempts_total',
                    help: 'Total number of retry attempts',
                    labelNames: ['operation'],
                }),
                circuitBreakerStateChanges: new Counter({
                    name: 'supabase_circuit_breaker_state_changes_total',
                    help: 'Total circuit breaker state changes',
                    labelNames: ['from_state', 'to_state'],
                }),
                telemetryLogsDropped: new Counter({
                    name: 'supabase_telemetry_logs_dropped_total',
                    help: 'Total telemetry logs dropped due to overflow',
                }),
                telemetryQueueSize: new Gauge({
                    name: 'supabase_telemetry_queue_size',
                    help: 'Current telemetry queue size',
                }),
                circuitBreakerState: new Gauge({
                    name: 'supabase_circuit_breaker_state',
                    help: 'Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
                }),
            };
        }
        this.updateCircuitBreakerMetric();
    }
    updateCircuitBreakerMetric() {
        const state = this.circuitBreaker.getState();
        const stateValue = state === CircuitState.CLOSED ? 0 : state === CircuitState.OPEN ? 1 : 2;
        this.metrics.circuitBreakerState.set(stateValue);
    }
    recordCircuitBreakerStateChange(fromState, toState) {
        if (fromState !== toState) {
            this.metrics.circuitBreakerStateChanges.labels(fromState, toState).inc();
            this.updateCircuitBreakerMetric();
        }
    }
    async withRetry(operation, fn) {
        if (!this.circuitBreaker.shouldAttempt()) {
            throw new Error(`Circuit breaker is OPEN for ${operation}`);
        }
        let lastError = null;
        for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
            try {
                const result = await fn();
                const previousState = this.circuitBreaker.recordSuccess();
                this.recordCircuitBreakerStateChange(previousState, this.circuitBreaker.getState());
                return result;
            }
            catch (error) {
                lastError = error;
                const shouldRetry = this.shouldRetryError(error);
                if (!shouldRetry || attempt >= this.retryConfig.maxAttempts) {
                    const previousState = this.circuitBreaker.recordFailure();
                    this.recordCircuitBreakerStateChange(previousState, this.circuitBreaker.getState());
                    break;
                }
                this.metrics.retryAttempts.labels(operation).inc();
                const delay = this.calculateBackoffDelay(attempt);
                console.warn(`[SupabaseStore] ${operation} failed (attempt ${attempt}/${this.retryConfig.maxAttempts}), retrying in ${delay}ms:`, error.message);
                await this.sleep(delay);
            }
        }
        throw lastError || new Error(`${operation} failed after ${this.retryConfig.maxAttempts} attempts`);
    }
    shouldRetryError(error) {
        if (error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT') {
            return true;
        }
        if (error?.status === 429 || (error?.status >= 500 && error?.status < 600)) {
            return true;
        }
        if (error?.status === 401 || error?.status === 403 || (error?.status >= 400 && error?.status < 500)) {
            return false;
        }
        return true;
    }
    calculateBackoffDelay(attempt) {
        const exponentialDelay = this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.multiplier, attempt - 1);
        const cappedDelay = Math.min(exponentialDelay, this.retryConfig.maxDelayMs);
        const jitter = cappedDelay * (this.retryConfig.jitterPercent / 100);
        const jitterOffset = (Math.random() - 0.5) * 2 * jitter;
        return Math.floor(cappedDelay + jitterOffset);
    }
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async sendTelemetryLog(log) {
        if (this.batchQueue.length >= this.MAX_QUEUE_SIZE) {
            const dropped = this.batchQueue.shift();
            this.metrics.telemetryLogsDropped.inc();
            console.warn('[SupabaseStore] Telemetry queue overflow, dropped oldest log:', dropped?.message);
        }
        this.batchQueue.push(log);
        this.metrics.telemetryQueueSize.set(this.batchQueue.length);
        if (this.batchQueue.length >= this.BATCH_SIZE) {
            await this.flushBatch();
        }
        else if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                this.flushBatch().catch((error) => {
                    console.error('Failed to flush telemetry batch:', error);
                });
            }, this.BATCH_INTERVAL_MS);
        }
        if (log.level === 'error' && this.forceFlushOnError) {
            await this.flushBatch();
        }
    }
    async sendTelemetryBatch(logs) {
        for (const log of logs) {
            if (this.batchQueue.length >= this.MAX_QUEUE_SIZE) {
                const dropped = this.batchQueue.shift();
                this.metrics.telemetryLogsDropped.inc();
                console.warn('[SupabaseStore] Telemetry queue overflow, dropped oldest log:', dropped?.message);
            }
            this.batchQueue.push(log);
        }
        this.metrics.telemetryQueueSize.set(this.batchQueue.length);
        await this.flushBatch();
    }
    async flushBatch() {
        if (this.batchQueue.length === 0)
            return;
        const logs = this.batchQueue.splice(0, this.batchQueue.length);
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        try {
            await this.withRetry('telemetry_batch', async () => {
                const startTime = Date.now();
                const { error } = await this.client
                    .from('telemetry_logs')
                    .insert(logs.map((log) => ({
                    kiosk_id: log.kioskId,
                    level: log.level,
                    message: log.message,
                    metadata: log.metadata || {},
                    timestamp: log.timestamp.toISOString(),
                })));
                const duration = (Date.now() - startTime) / 1000;
                this.metrics.operationDuration.labels('telemetry_batch').observe(duration);
                if (error) {
                    this.metrics.operationsTotal.labels('telemetry_batch', 'error').inc();
                    throw new Error(`Failed to insert telemetry logs: ${error.message}`);
                }
                this.metrics.operationsTotal.labels('telemetry_batch', 'success').inc();
            });
            this.metrics.telemetryQueueSize.set(this.batchQueue.length);
        }
        catch (error) {
            this.metrics.operationsTotal.labels('telemetry_batch', 'error').inc();
            this.batchQueue.unshift(...logs);
            this.metrics.telemetryQueueSize.set(this.batchQueue.length);
            throw error;
        }
    }
    async uploadReport(sessionId, format, content) {
        return await this.withRetry('upload_report', async () => {
            const startTime = Date.now();
            const fileName = `${sessionId}.${format}`;
            const filePath = `reports/${fileName}`;
            const { error } = await this.client.storage
                .from('reports')
                .upload(filePath, content, {
                contentType: format === 'html' ? 'text/html' : 'application/pdf',
                upsert: true,
            });
            const duration = (Date.now() - startTime) / 1000;
            this.metrics.operationDuration.labels('upload_report').observe(duration);
            if (error) {
                this.metrics.operationsTotal.labels('upload_report', 'error').inc();
                throw new Error(`Failed to upload report: ${error.message}`);
            }
            this.metrics.operationsTotal.labels('upload_report', 'success').inc();
            const { data } = this.client.storage.from('reports').getPublicUrl(filePath);
            return data.publicUrl;
        });
    }
    async getReportUrl(sessionId, format) {
        return await this.withRetry('get_report_url', async () => {
            const startTime = Date.now();
            const fileName = `${sessionId}.${format}`;
            const filePath = `reports/${fileName}`;
            const { data, error } = await this.client.storage
                .from('reports')
                .list('reports', {
                search: fileName,
            });
            const duration = (Date.now() - startTime) / 1000;
            this.metrics.operationDuration.labels('get_report_url').observe(duration);
            if (error) {
                this.metrics.operationsTotal.labels('get_report_url', 'error').inc();
                throw new Error(`Failed to check report existence: ${error.message}`);
            }
            if (!data || data.length === 0) {
                this.metrics.operationsTotal.labels('get_report_url', 'not_found').inc();
                return null;
            }
            this.metrics.operationsTotal.labels('get_report_url', 'success').inc();
            const { data: urlData } = this.client.storage.from('reports').getPublicUrl(filePath);
            return urlData.publicUrl;
        });
    }
    async getFeatureFlags() {
        try {
            return await this.withRetry('get_feature_flags', async () => {
                const startTime = Date.now();
                const { data, error } = await this.client
                    .from('feature_flags')
                    .select('flag_name, enabled')
                    .eq('enabled', true);
                const duration = (Date.now() - startTime) / 1000;
                this.metrics.operationDuration.labels('get_feature_flags').observe(duration);
                if (error) {
                    this.metrics.operationsTotal.labels('get_feature_flags', 'error').inc();
                    throw new Error(`Failed to fetch feature flags: ${error.message}`);
                }
                this.metrics.operationsTotal.labels('get_feature_flags', 'success').inc();
                const flags = {};
                if (data) {
                    for (const row of data) {
                        flags[row.flag_name] = row.enabled;
                    }
                }
                return flags;
            });
        }
        catch (error) {
            this.metrics.operationsTotal.labels('get_feature_flags', 'error').inc();
            console.warn('Failed to fetch feature flags, using defaults:', error.message);
            return {};
        }
    }
    async close() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        if (this.batchQueue.length > 0) {
            try {
                await this.flushBatch();
            }
            catch (error) {
                console.error('Failed to flush remaining telemetry logs on close:', error);
            }
        }
        this.metrics.telemetryQueueSize.set(0);
    }
}
export function createSupabaseStore(url, key, registry) {
    return new SupabaseStore(url, key, registry);
}
