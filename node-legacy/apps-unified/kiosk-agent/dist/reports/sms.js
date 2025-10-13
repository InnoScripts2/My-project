import * as fs from 'node:fs';
import * as path from 'node:path';
export function getSmsConfigFromEnv() {
    const provider = (process.env.SMS_PROVIDER || '').toLowerCase();
    // For the prototype, require at least provider; details depend on provider
    if (!provider)
        return null;
    return {
        provider,
        accountSid: process.env.SMS_ACCOUNT_SID,
        authToken: process.env.SMS_AUTH_TOKEN,
        from: process.env.SMS_FROM,
    };
}
export async function sendSms(toPhone, text, cfg, outboxRoot) {
    // Minimal implementation: in DEV we'll append to a local log for observability
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (cfg.provider === 'dev' && outboxRoot) {
        const logDir = path.join(outboxRoot, 'sent');
        fs.mkdirSync(logDir, { recursive: true });
        const line = JSON.stringify({ kind: 'sms', id, to: toPhone, text, at: new Date().toISOString() });
        fs.appendFileSync(path.join(logDir, 'sent_sms.jsonl'), line + '\n', 'utf8');
        return { id };
    }
    // Incomplete: real providers can be added later
    // Throw explicit error to map to 501
    const err = new Error('sms_provider_not_configured');
    err.code = 'sms_provider_not_configured';
    throw err;
}
