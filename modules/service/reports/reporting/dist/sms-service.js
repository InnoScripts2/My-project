/**
 * SMS delivery service
 */
export class SmsService {
    config;
    constructor(config) {
        this.config = config;
    }
    async sendNotification(to, message) {
        try {
            if (this.config.provider === 'dev') {
                console.log(`[SmsService DEV] Would send SMS to: ${to}`);
                console.log(`[SmsService DEV] Message: ${message}`);
                return {
                    success: true,
                    deliveryId: `dev-sms-${Date.now()}`,
                };
            }
            // Placeholder for real SMS providers
            // TODO: Implement Twilio, SMSC, etc.
            console.warn('[SmsService] Real SMS providers not yet implemented');
            return {
                success: false,
                error: 'SMS provider not configured',
            };
        }
        catch (error) {
            console.error('[SmsService] Send error:', error);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async sendReportNotification(to, reportType, sessionId) {
        const message = `Ваш отчет ${reportType === 'diagnostics' ? 'диагностики' : 'толщинометрии'} готов! Сессия: ${sessionId}`;
        return this.sendNotification(to, message);
    }
}
//# sourceMappingURL=sms-service.js.map