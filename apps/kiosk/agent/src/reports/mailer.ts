import {
	EmailService,
	type EmailConfig,
	type ReportDeliveryResult,
} from '../reporting/module.js';
import type { GeneratedReport } from './service.js';

let cachedService: { key: string; service: EmailService } | null = null;

export function getMailConfigFromEnv(): EmailConfig | null {
	const provider = (process.env.EMAIL_PROVIDER || process.env.REPORTS_EMAIL_PROVIDER || 'dev').toLowerCase() as EmailConfig['provider'];
	if (provider !== 'smtp' && provider !== 'sendgrid' && provider !== 'dev') {
		return null;
	}

	const from = process.env.EMAIL_FROM || process.env.REPORTS_EMAIL_FROM || 'noreply@autoservice.local';
	if (!from) {
		return null;
	}

	const config: EmailConfig = {
		provider,
		from,
		smtp: provider === 'smtp' ? {
			host: process.env.SMTP_HOST || 'localhost',
			port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
			secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
			auth: process.env.SMTP_USER
				? {
						user: process.env.SMTP_USER,
						pass: process.env.SMTP_PASS || '',
					}
				: undefined,
		} : undefined,
		sendgrid: provider === 'sendgrid' ? {
			apiKey: process.env.SENDGRID_API_KEY || '',
		} : undefined,
	};

	if (provider === 'sendgrid' && !config.sendgrid?.apiKey) {
		return null;
	}

	return config;
}

export async function sendReportEmail(toEmail: string, report: GeneratedReport, cfg: EmailConfig): Promise<ReportDeliveryResult> {
	const service = getEmailService(cfg);
	const attachmentPath = report.pdfPath ?? report.htmlPath;
	return service.sendReport(toEmail, attachmentPath, report.type);
}

function getEmailService(cfg: EmailConfig): EmailService {
	const key = JSON.stringify(cfg);
	if (cachedService && cachedService.key === key) {
		return cachedService.service;
	}
	const service = new EmailService(cfg);
	cachedService = { key, service };
	return service;
}

