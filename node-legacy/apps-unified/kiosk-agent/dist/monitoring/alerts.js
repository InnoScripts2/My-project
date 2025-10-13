export function evaluateAlerts(input) {
    const now = input.timestamp ?? new Date();
    const alerts = [];
    if (input.payments) {
        alerts.push(...evaluatePaymentAlerts(input.payments, now, input.environment));
    }
    return alerts.sort(sortBySeverity);
}
function evaluatePaymentAlerts(snapshot, now, environment) {
    const alerts = [];
    if (snapshot.pendingOver90s > 0) {
        const severity = environment === 'DEV' ? 'warning' : 'critical';
        alerts.push({
            id: 'payments.pending_over_90s',
            severity,
            title: 'Зависшие оплаты',
            description: `Обнаружено ${snapshot.pendingOver90s} оплат(ы) без подтверждения более 90 секунд`,
            detectedAt: now.toISOString(),
            data: {
                pendingOver90s: snapshot.pendingOver90s,
                totalIntents: snapshot.totalIntents,
                lastEventAt: snapshot.lastEventAt ?? null,
                environment
            }
        });
    }
    return alerts;
}
const severityWeight = {
    info: 0,
    warning: 1,
    critical: 2
};
function sortBySeverity(a, b) {
    const diff = severityWeight[b.severity] - severityWeight[a.severity];
    if (diff !== 0) {
        return diff;
    }
    return a.id.localeCompare(b.id);
}
