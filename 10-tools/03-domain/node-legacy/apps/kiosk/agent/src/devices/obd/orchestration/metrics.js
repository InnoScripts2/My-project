/**
 * OBD Orchestrator Prometheus Metrics
 * Metrics collection for monitoring OBD diagnostic sessions
 */
import { Counter, Histogram } from 'prom-client';
export function createObdMetrics(register) {
    const sessionsTotal = new Counter({
        name: 'obd_sessions_total',
        help: 'Total number of OBD diagnostic sessions started',
        registers: [register],
    });
    const scansCompleted = new Counter({
        name: 'obd_scans_completed_total',
        help: 'Total number of successfully completed OBD scans',
        registers: [register],
    });
    const scansFailed = new Counter({
        name: 'obd_scans_failed_total',
        help: 'Total number of failed OBD scans',
        labelNames: ['reason'],
        registers: [register],
    });
    const dtcCleared = new Counter({
        name: 'obd_dtc_cleared_total',
        help: 'Total number of DTC clear operations',
        registers: [register],
    });
    const scanDuration = new Histogram({
        name: 'obd_scan_duration_seconds',
        help: 'Duration of OBD scan operations in seconds',
        buckets: [1, 5, 10, 30, 60, 120],
        registers: [register],
    });
    return {
        sessionsTotal,
        scansCompleted,
        scansFailed,
        dtcCleared,
        scanDuration,
    };
}
