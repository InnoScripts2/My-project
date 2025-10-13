/**
 * Email delivery service
 */
import type { EmailConfig, ReportDeliveryResult } from './types.js';
export declare class EmailService {
    private transporter;
    private config;
    constructor(config: EmailConfig);
    sendReport(to: string, reportPath: string, reportType: 'diagnostics' | 'thickness'): Promise<ReportDeliveryResult>;
    verify(): Promise<boolean>;
}
//# sourceMappingURL=email-service.d.ts.map