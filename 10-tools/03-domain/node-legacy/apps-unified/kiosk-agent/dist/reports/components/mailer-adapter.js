import { Counter, Histogram } from 'prom-client';
import { register } from 'prom-client';
const mailerSuccess = new Counter({
    name: 'reports_mailer_success_total',
    help: 'Total number of successful email deliveries',
    registers: [register],
});
const mailerError = new Counter({
    name: 'reports_mailer_error_total',
    help: 'Total number of failed email deliveries',
    registers: [register],
});
const mailerDuration = new Histogram({
    name: 'reports_mailer_duration_seconds',
    help: 'Duration of email delivery in seconds',
    registers: [register],
});
/**
 * Валидировать конфигурацию email из переменных окружения
 */
export function getMailerConfigFromEnv() {
    const host = process.env.SMTP_HOST;
    const from = process.env.SMTP_FROM;
    if (!host || !from) {
        return null;
    }
    return {
        host,
        from,
        port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
        secure: process.env.SMTP_SECURE === '1' || process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    };
}
/**
 * Утилита для retry с exponential backoff
 */
async function retryWithBackoff(fn, maxAttempts = 3, initialDelay = 2000) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < maxAttempts) {
                const delay = initialDelay * Math.pow(2, attempt - 1);
                console.warn(`[Retry] Attempt ${attempt} failed, retrying in ${delay}ms...`, lastError.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}
/**
 * Rate limiter для защиты от спама
 */
class RateLimiter {
    constructor(maxAttempts = 10, windowMs = 60 * 60 * 1000) {
        this.attempts = new Map();
        this.maxAttempts = maxAttempts;
        this.windowMs = windowMs;
    }
    check(key) {
        const now = Date.now();
        const attempts = this.attempts.get(key) || [];
        const recentAttempts = attempts.filter(time => now - time < this.windowMs);
        if (recentAttempts.length >= this.maxAttempts) {
            return false;
        }
        recentAttempts.push(now);
        this.attempts.set(key, recentAttempts);
        return true;
    }
}
const emailRateLimiter = new RateLimiter(10, 60 * 60 * 1000);
/**
 * Валидация email формата
 */
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
/**
 * DEV-заглушка для отправки email (только логирование)
 */
export class DevMailerAdapter {
    constructor() {
        this.env = process.env.AGENT_ENV || 'DEV';
    }
    async send(payload) {
        if (!validateEmail(payload.to)) {
            throw new Error('Invalid email format');
        }
        const kioskId = process.env.KIOSK_ID || 'default';
        if (!emailRateLimiter.check(kioskId)) {
            throw new Error('Rate limit exceeded: maximum 10 emails per hour');
        }
        const timer = mailerDuration.startTimer();
        try {
            await retryWithBackoff(async () => {
                if (this.env === 'DEV') {
                    console.log('[DEV Mailer] Email would be sent:');
                    console.log(`  To: ${payload.to}`);
                    console.log(`  Subject: ${payload.subject}`);
                    console.log(`  Body length: ${payload.htmlBody.length} chars`);
                    if (payload.attachmentPath) {
                        console.log(`  Attachment: ${payload.attachmentPath}`);
                    }
                }
                else {
                    throw new Error('Mailer not implemented for PROD environment. Use Edge Function integration.');
                }
            });
            mailerSuccess.inc();
        }
        catch (error) {
            mailerError.inc();
            throw error;
        }
        finally {
            timer();
        }
    }
}
/**
 * Создать адаптер отправки email на основе окружения
 */
export function createMailerAdapter() {
    const env = process.env.AGENT_ENV || 'DEV';
    if (env === 'PROD') {
        throw new Error('Mailer not implemented for PROD. Use Edge Function integration.');
    }
    return new DevMailerAdapter();
}
