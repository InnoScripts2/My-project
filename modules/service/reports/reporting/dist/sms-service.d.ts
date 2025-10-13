/**
 * SMS delivery service
 */
import type { SmsConfig, ReportDeliveryResult } from './types.js';
export declare class SmsService {
    private config;
    constructor(config: SmsConfig);
    sendNotification(to: string, message: string): Promise<ReportDeliveryResult>;
    sendReportNotification(to: string, reportType: 'diagnostics' | 'thickness', sessionId: string): Promise<ReportDeliveryResult>;
}
//# sourceMappingURL=sms-service.d.ts.map