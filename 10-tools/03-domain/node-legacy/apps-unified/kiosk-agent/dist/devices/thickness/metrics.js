/**
 * thickness-metrics.ts - Prometheus metrics for thickness analysis
 */
import { Counter, Histogram } from 'prom-client';
export function registerThicknessAnalysisMetrics(registry) {
    const thicknessAnomaliesDetected = new Counter({
        name: 'thickness_anomalies_detected_total',
        help: 'Total number of thickness anomalies detected',
        labelNames: ['type', 'severity'],
        registers: [registry],
    });
    const thicknessRepairZonesDetected = new Counter({
        name: 'thickness_repair_zones_detected_total',
        help: 'Total number of repair zones detected',
        registers: [registry],
    });
    const thicknessAnalysisDuration = new Histogram({
        name: 'thickness_analysis_duration_seconds',
        help: 'Duration of thickness analysis operations',
        labelNames: ['operation'],
        buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
        registers: [registry],
    });
    return {
        thicknessAnomaliesDetected,
        thicknessRepairZonesDetected,
        thicknessAnalysisDuration,
    };
}
export function registerThicknessDriverMetrics(registry) {
    const sessionsTotal = new Counter({
        name: 'thickness_sessions_total',
        help: 'Total number of thickness measurement sessions',
        labelNames: ['status'],
        registers: [registry],
    });
    const measurementsTotal = new Counter({
        name: 'thickness_measurements_total',
        help: 'Total number of measurements by zone',
        labelNames: ['zoneId'],
        registers: [registry],
    });
    const sessionDuration = new Histogram({
        name: 'thickness_session_duration_seconds',
        help: 'Duration of thickness measurement sessions',
        buckets: [30, 60, 120, 180, 240, 300],
        registers: [registry],
    });
    const errorsTotal = new Counter({
        name: 'thickness_errors_total',
        help: 'Total number of thickness measurement errors',
        labelNames: ['type'],
        registers: [registry],
    });
    return {
        sessionsTotal,
        measurementsTotal,
        sessionDuration,
        errorsTotal,
    };
}
