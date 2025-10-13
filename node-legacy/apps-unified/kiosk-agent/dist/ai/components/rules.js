/**
 * Агрегатор статусов диагностики OBD-II
 *
 * Принимает данные сканирования и возвращает итоговый статус:
 * - "OK" - нет проблем
 * - "WARNING" - предупреждение (рекомендуется проверка)
 * - "CRITICAL" - критическая проблема (требуется ремонт)
 */
import { Counter, Histogram } from 'prom-client';
let diagnosticMetrics = null;
export function registerMetrics(registry) {
    if (diagnosticMetrics)
        return diagnosticMetrics;
    diagnosticMetrics = {
        statusTotal: new Counter({
            name: 'obd_diagnostic_status_total',
            help: 'Total number of OBD diagnostics by status',
            labelNames: ['status'],
            registers: [registry],
        }),
        duration: new Histogram({
            name: 'obd_diagnostic_duration_seconds',
            help: 'Duration of OBD diagnostic aggregation',
            buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
            registers: [registry],
        }),
    };
    return diagnosticMetrics;
}
export function aggregateObdStatus(scanResult) {
    const startTime = Date.now();
    const summary = {
        status: 'OK',
        dtcCount: scanResult.dtcCodes.length,
        criticalCodes: [],
        warningCodes: [],
        recommendations: [],
    };
    if (scanResult.milStatus === 'ON') {
        summary.status = 'CRITICAL';
        summary.criticalCodes.push('MIL_ON');
        summary.recommendations.push('Индикатор неисправности двигателя активен. Требуется диагностика.');
    }
    if (scanResult.freezeFrame !== null) {
        summary.status = 'CRITICAL';
        summary.criticalCodes.push(`FREEZE_FRAME_${scanResult.freezeFrame.dtcCode}`);
        summary.recommendations.push(`Зафиксированы данные момента неисправности для кода ${scanResult.freezeFrame.dtcCode}.`);
    }
    for (const dtc of scanResult.dtcCodes) {
        const isPowertrainCritical = (dtc.code.startsWith('P0') || dtc.code.startsWith('P2')) &&
            (dtc.status === 'Confirmed' || dtc.status === 'Pending');
        if (isPowertrainCritical) {
            summary.status = 'CRITICAL';
            summary.criticalCodes.push(dtc.code);
        }
        else if (dtc.status === 'Stored' && !summary.criticalCodes.includes(dtc.code)) {
            if (summary.status === 'OK') {
                summary.status = 'WARNING';
            }
            summary.warningCodes.push(dtc.code);
        }
    }
    const notReadyMonitors = scanResult.readinessMonitors.filter((m) => m.status === 'NotReady' || m.status === 'Incomplete');
    if (notReadyMonitors.length > 0 && summary.status === 'OK') {
        summary.status = 'WARNING';
        summary.recommendations.push(`Не все системы готовы к проверке (${notReadyMonitors.length} систем не готовы).`);
    }
    if (summary.status === 'OK') {
        summary.recommendations.push('Системы автомобиля работают в штатном режиме.');
    }
    else if (summary.status === 'CRITICAL') {
        summary.recommendations.push('Обнаружены критические неисправности. Рекомендуется немедленное обращение в сервис.');
    }
    else if (summary.status === 'WARNING') {
        summary.recommendations.push('Обнаружены потенциальные проблемы. Рекомендуется проверка в сервисе.');
    }
    const duration = (Date.now() - startTime) / 1000;
    if (diagnosticMetrics) {
        diagnosticMetrics.statusTotal.labels(summary.status).inc();
        diagnosticMetrics.duration.observe(duration);
    }
    return summary;
}
