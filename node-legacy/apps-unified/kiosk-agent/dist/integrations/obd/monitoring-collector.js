/**
 * OBD Monitoring Collector
 * Registers and records Prometheus metrics for OBD diagnostics workflow
 */
import { Counter, Histogram, Gauge, Registry } from 'prom-client';
export class ObdMonitoringCollector {
    constructor(registry) {
        this.registry = registry ?? new Registry();
        this.metrics = this.registerMetrics();
    }
    registerMetrics() {
        const connectionAttempts = new Counter({
            name: 'obd_connection_attempts_total',
            help: 'Total number of OBD connection attempts',
            labelNames: ['transport', 'result'],
            registers: [this.registry],
        });
        const connectionSuccess = new Counter({
            name: 'obd_connection_success_total',
            help: 'Total number of successful OBD connections',
            labelNames: ['transport'],
            registers: [this.registry],
        });
        const connectionDuration = new Histogram({
            name: 'obd_connection_duration_seconds',
            help: 'Duration of OBD connection attempts',
            labelNames: ['transport', 'result'],
            buckets: [1, 2, 5, 10, 15, 30, 60],
            registers: [this.registry],
        });
        const scanCompleted = new Counter({
            name: 'obd_scan_completed_total',
            help: 'Total number of completed OBD scans',
            labelNames: ['vehicle_make', 'result'],
            registers: [this.registry],
        });
        const scanDuration = new Histogram({
            name: 'obd_scan_duration_seconds',
            help: 'Duration of OBD diagnostic scans',
            labelNames: ['vehicle_make'],
            buckets: [10, 20, 30, 45, 60, 90, 120],
            registers: [this.registry],
        });
        const dtcCount = new Histogram({
            name: 'obd_dtc_count',
            help: 'Number of DTCs found per scan',
            buckets: [0, 1, 2, 3, 5, 10, 20],
            registers: [this.registry],
        });
        const paymentConversion = new Counter({
            name: 'obd_payment_conversion_total',
            help: 'Total number of payment conversion attempts',
            labelNames: ['result'],
            registers: [this.registry],
        });
        const reportGeneration = new Histogram({
            name: 'obd_report_generation_duration_seconds',
            help: 'Duration of report generation',
            buckets: [1, 2, 5, 10, 15, 30],
            registers: [this.registry],
        });
        const reportDelivery = new Counter({
            name: 'obd_report_delivery_status_total',
            help: 'Total number of report delivery attempts',
            labelNames: ['method', 'status'],
            registers: [this.registry],
        });
        const errors = new Counter({
            name: 'obd_errors_total',
            help: 'Total number of errors by type and severity',
            labelNames: ['type', 'severity'],
            registers: [this.registry],
        });
        const activeSessions = new Gauge({
            name: 'obd_active_sessions_total',
            help: 'Current number of active OBD diagnostic sessions',
            registers: [this.registry],
        });
        const adapterLockStatus = new Gauge({
            name: 'obd_adapter_lock_status',
            help: 'Current status of OBD adapter lock (1=locked, 0=unlocked)',
            registers: [this.registry],
        });
        return {
            connectionAttempts,
            connectionSuccess,
            connectionDuration,
            scanCompleted,
            scanDuration,
            dtcCount,
            paymentConversion,
            reportGeneration,
            reportDelivery,
            errors,
            activeSessions,
            adapterLockStatus,
        };
    }
    /**
     * Record a connection attempt
     */
    recordConnectionAttempt(transport, success, durationSeconds) {
        const result = success ? 'success' : 'failure';
        this.metrics.connectionAttempts.inc({ transport, result });
        this.metrics.connectionDuration.observe({ transport, result }, durationSeconds);
        if (success) {
            this.metrics.connectionSuccess.inc({ transport });
        }
    }
    /**
     * Record a completed scan
     */
    recordScanCompleted(vehicleMake, durationSeconds, dtcCount, success = true) {
        const result = success ? 'success' : 'failure';
        this.metrics.scanCompleted.inc({ vehicle_make: vehicleMake, result });
        if (success) {
            this.metrics.scanDuration.observe({ vehicle_make: vehicleMake }, durationSeconds);
            this.metrics.dtcCount.observe(dtcCount);
        }
    }
    /**
     * Record payment conversion
     */
    recordPaymentConversion(successful) {
        const result = successful ? 'success' : 'failure';
        this.metrics.paymentConversion.inc({ result });
    }
    /**
     * Record report generation
     */
    recordReportGeneration(durationSeconds) {
        this.metrics.reportGeneration.observe(durationSeconds);
    }
    /**
     * Record report delivery
     */
    recordReportDelivery(method, success) {
        const status = success ? 'success' : 'failure';
        this.metrics.reportDelivery.inc({ method, status });
    }
    /**
     * Record an error
     */
    recordError(type, severity) {
        this.metrics.errors.inc({ type, severity });
    }
    /**
     * Update active sessions count
     */
    updateActiveSessions(count) {
        this.metrics.activeSessions.set(count);
    }
    /**
     * Update adapter lock status
     */
    updateAdapterLockStatus(locked) {
        this.metrics.adapterLockStatus.set(locked ? 1 : 0);
    }
    /**
     * Get metrics registry
     */
    getRegistry() {
        return this.registry;
    }
    /**
     * Get metrics as Prometheus format
     */
    async getMetrics() {
        return this.registry.metrics();
    }
}
/**
 * Create and export singleton instance
 */
let monitoringCollectorInstance = null;
export function getObdMonitoringCollector(registry) {
    if (!monitoringCollectorInstance) {
        monitoringCollectorInstance = new ObdMonitoringCollector(registry);
    }
    return monitoringCollectorInstance;
}
