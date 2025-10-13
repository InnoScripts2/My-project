import {
	SmsService,
	type SmsConfig,
	type ReportDeliveryResult,
} from '../reporting/module.js';

let cachedSms: { key: string; service: SmsService } | null = null;

export function getSmsConfigFromEnv(): SmsConfig | null {
	const provider = (process.env.SMS_PROVIDER || process.env.REPORTS_SMS_PROVIDER || 'dev').toLowerCase() as SmsConfig['provider'];
	if (provider !== 'twilio' && provider !== 'smsc' && provider !== 'dev') {
		return null;
	}

	const from = process.env.SMS_FROM || process.env.REPORTS_SMS_FROM || '';
	const config: SmsConfig = {
		provider,
		from,
		twilio: provider === 'twilio' ? {
			accountSid: process.env.TWILIO_ACCOUNT_SID || '',
			authToken: process.env.TWILIO_AUTH_TOKEN || '',
		} : undefined,
		smsc: provider === 'smsc' ? {
			login: process.env.SMSC_LOGIN || '',
			password: process.env.SMSC_PASSWORD || '',
		} : undefined,
	};

	if (provider === 'twilio' && (!config.twilio?.accountSid || !config.twilio?.authToken)) {
		return null;
	}
	if (provider === 'smsc' && (!config.smsc?.login || !config.smsc?.password)) {
		return null;
	}

	return config;
}

export async function sendSms(toPhone: string, message: string, cfg: SmsConfig): Promise<ReportDeliveryResult> {
	const service = getSmsService(cfg);
	return service.sendNotification(toPhone, message);
}

function getSmsService(cfg: SmsConfig): SmsService {
	const key = JSON.stringify(cfg);
	if (cachedSms && cachedSms.key === key) {
		return cachedSms.service;
	}
	const service = new SmsService(cfg);
	cachedSms = { key, service };
	return service;
}

