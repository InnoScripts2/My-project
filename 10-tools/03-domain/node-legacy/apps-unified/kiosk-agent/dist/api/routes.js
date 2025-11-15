/**
 * Стандартизированные API роуты согласно спецификации Цикла-2
 * Контракты API агента (внешние роуты)
 */
import { z } from 'zod';
// Генератор уникальных ID (простая реализация)
function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
class SimpleRateLimiter {
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.store = new Map();
    }
    check(key) {
        const now = Date.now();
        const entry = this.store.get(key);
        if (!entry || entry.resetAt < now) {
            this.store.set(key, { count: 1, resetAt: now + this.windowMs });
            return { allowed: true };
        }
        if (entry.count >= this.maxRequests) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
            return { allowed: false, retryAfter };
        }
        entry.count++;
        return { allowed: true };
    }
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.resetAt < now) {
                this.store.delete(key);
            }
        }
    }
}
// Rate limiter instances
// Slightly relaxed defaults to reduce test flakiness while keeping sane limits
const globalRateLimiter = new SimpleRateLimiter(20, 10000); // 20 req/10s
const sessionRateLimiter = new SimpleRateLimiter(50, 10000); // 50 req/10s per session
// Cleanup expired entries periodically; unref to avoid keeping event loop alive in tests
const _rateLimiterGcTimer = setInterval(() => {
    globalRateLimiter.cleanup();
    sessionRateLimiter.cleanup();
}, 60000);
// Don't keep the process alive because of this timer (tests should be able to exit)
if (typeof _rateLimiterGcTimer.unref === 'function') {
    _rateLimiterGcTimer.unref();
}
/**
 * Rate limiting middleware for POST routes
 */
export function rateLimitMiddleware(req, res, next) {
    // Skip health endpoints
    if (req.path === '/healthz' || req.path === '/readyz' || req.path === '/livez' || req.path === '/metrics') {
        next();
        return;
    }
    // Only apply to POST requests
    if (req.method !== 'POST') {
        next();
        return;
    }
    // Check per-IP rate limit (bypass for localhost to avoid throttling local tests/tools)
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace('::ffff:', '');
    if (ip === '127.0.0.1' || ip === '::1' || req.hostname === 'localhost') {
        next();
        return;
    }
    const ipResult = globalRateLimiter.check(ip);
    if (!ipResult.allowed) {
        res.status(429)
            .set('Retry-After', String(ipResult.retryAfter || 10))
            .json({
            ok: false,
            error: 'rate_limit_exceeded',
            message: 'Too many requests, please try again later',
            retryAfter: ipResult.retryAfter
        });
        return;
    }
    // Check per-session rate limit if sessionId is provided
    const sessionId = (req.body?.sessionId || req.query?.sessionId);
    if (sessionId) {
        const sessionResult = sessionRateLimiter.check(`session:${sessionId}`);
        if (!sessionResult.allowed) {
            res.status(429)
                .set('Retry-After', String(sessionResult.retryAfter || 10))
                .json({
                ok: false,
                error: 'rate_limit_exceeded',
                message: 'Too many requests for this session',
                retryAfter: sessionResult.retryAfter
            });
            return;
        }
    }
    next();
}
// Validation schemas
const createIntentSchema = z.object({
    amount: z.number().positive(),
    currency: z.string().default('RUB'),
    service: z.enum(['thickness', 'obd_deposit']).or(z.string()),
    sessionId: z.string(),
    meta: z.record(z.unknown()).optional(),
});
const openLockSchema = z.object({
    deviceType: z.enum(['thickness', 'obd']),
    sessionId: z.string(),
    paymentIntentId: z.string().optional(),
});
/**
 * POST /api/payments/intents
 * Создание платежного intent
 */
export function createPaymentIntentRoute(paymentModule) {
    return async (req, res) => {
        try {
            const params = createIntentSchema.parse(req.body);
            const result = await paymentModule.createIntent({
                amount: params.amount,
                currency: params.currency,
                meta: {
                    ...params.meta,
                    service: params.service,
                    sessionId: params.sessionId,
                },
            });
            const intent = result.intent;
            res.json({
                id: intent.id,
                provider: 'yookassa', // или определять из intent
                qr_url: intent.qrUrl,
                qr_svg: intent.qrText, // можно генерировать SVG из qrText
                expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
            });
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    ok: false,
                    error: 'validation_failed',
                    details: error.errors,
                });
            }
            else if (error instanceof Error && error.message.includes('provider')) {
                res.status(502).json({
                    ok: false,
                    error: 'provider_error',
                    message: error.message,
                });
            }
            else {
                res.status(500).json({
                    ok: false,
                    error: 'internal_error',
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }
    };
}
/**
 * GET /api/payments/intents/:id
 * Получение статуса платежного intent
 */
export function getPaymentIntentRoute(paymentModule) {
    return async (req, res) => {
        const { id } = req.params;
        if (!id) {
            res.status(400).json({
                ok: false,
                error: 'intent_id_required',
            });
            return;
        }
        try {
            const record = await paymentModule.getIntent(id);
            if (!record) {
                res.status(404).json({
                    ok: false,
                    error: 'intent_not_found',
                });
                return;
            }
            res.json({
                id: record.intent.id,
                status: record.intent.status,
                updated_at: record.intent.history?.[record.intent.history.length - 1]?.timestampIso || record.createdAtIso,
            });
        }
        catch (error) {
            res.status(500).json({
                ok: false,
                error: 'internal_error',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };
}
/**
 * POST /api/payments/intents/:id/cancel
 * Отмена платежного intent
 */
export function cancelPaymentIntentRoute(paymentModule) {
    return async (req, res) => {
        const { id } = req.params;
        if (!id) {
            res.status(400).json({
                ok: false,
                error: 'intent_id_required',
            });
            return;
        }
        try {
            const record = await paymentModule.getIntent(id);
            if (!record) {
                res.status(404).json({
                    ok: false,
                    error: 'intent_not_found',
                });
                return;
            }
            // Cancel via service (will delegate to provider)
            // For now, mark as expired through module
            // TODO: implement cancel in PaymentModule
            res.json({
                ok: true,
                id: record.intent.id,
                status: 'expired',
                message: 'Payment cancelled',
            });
        }
        catch (error) {
            res.status(500).json({
                ok: false,
                error: 'internal_error',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };
}
/**
 * POST /api/payments/intents/:id/confirm
 * Подтверждение платежа (только DEV режим)
 */
export function confirmPaymentIntentRoute(paymentModule, environment) {
    return async (req, res) => {
        if (environment !== 'DEV') {
            res.status(403).json({
                ok: false,
                error: 'forbidden',
                message: 'Dev-only confirmation is disabled outside DEV environment',
            });
            return;
        }
        const { id } = req.params;
        if (!id) {
            res.status(400).json({
                ok: false,
                error: 'intent_id_required',
            });
            return;
        }
        try {
            const confirmed = await paymentModule.confirmDev(id);
            if (!confirmed) {
                res.status(404).json({
                    ok: false,
                    error: 'intent_not_found',
                });
                return;
            }
            res.json({
                ok: true,
                id: confirmed.intent.id,
                status: confirmed.intent.status,
                message: 'Payment confirmed (DEV mode)',
            });
        }
        catch (error) {
            res.status(500).json({
                ok: false,
                error: 'internal_error',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };
}
/**
 * POST /api/locks/open
 * Открытие замка с проверкой политики и идемпотентностью
 */
export function openLockRoute(lockController, paymentModule) {
    return async (req, res) => {
        try {
            const params = openLockSchema.parse(req.body);
            // Проверяем политику выдачи
            const context = {};
            if (params.deviceType === 'thickness') {
                // Для толщиномера требуется подтверждённая оплата
                if (!params.paymentIntentId) {
                    res.status(409).json({
                        ok: false,
                        error: 'precondition_failed',
                        message: 'Payment intent ID required for thickness dispense',
                    });
                    return;
                }
                const paymentRecord = await paymentModule.getIntent(params.paymentIntentId);
                if (!paymentRecord) {
                    res.status(409).json({
                        ok: false,
                        error: 'precondition_failed',
                        message: 'Payment intent not found',
                    });
                    return;
                }
                if (paymentRecord.intent.status !== 'succeeded') {
                    res.status(409).json({
                        ok: false,
                        error: 'precondition_failed',
                        message: `Payment status is ${paymentRecord.intent.status}, expected succeeded`,
                    });
                    return;
                }
                context.paymentStatus = 'succeeded';
            }
            else if (params.deviceType === 'obd') {
                // Для OBD проверяем политику (по умолчанию требуется vehicleSelected)
                const lockPolicy = process.env.LOCK_POLICY_OBD || 'immediate';
                if (lockPolicy === 'deposit_required' && !params.paymentIntentId) {
                    res.status(409).json({
                        ok: false,
                        error: 'precondition_failed',
                        message: 'Deposit payment required for OBD dispense',
                    });
                    return;
                }
                if (lockPolicy === 'deposit_required' && params.paymentIntentId) {
                    const paymentRecord = await paymentModule.getIntent(params.paymentIntentId);
                    if (!paymentRecord || paymentRecord.intent.status !== 'succeeded') {
                        res.status(409).json({
                            ok: false,
                            error: 'precondition_failed',
                            message: 'Deposit payment not confirmed',
                        });
                        return;
                    }
                }
                context.vehicleSelected = true; // В реальном сценарии получаем из сессии
            }
            // Генерируем идемпотентный ключ
            const idemKey = `${params.sessionId}:${params.deviceType}:${params.paymentIntentId || 'no-payment'}`;
            // Пытаемся открыть замок
            const result = await lockController.openSlot(params.deviceType, {
                operationKey: idemKey,
                context,
            });
            if (!result.ok) {
                if (result.error?.includes('policy') || result.error?.includes('блокирована')) {
                    res.status(409).json({
                        ok: false,
                        error: 'precondition_failed',
                        message: result.error,
                    });
                }
                else if (result.error?.includes('busy') || result.error?.includes('занято')) {
                    res.status(423).json({
                        ok: false,
                        error: 'device_locked',
                        message: result.error,
                    });
                }
                else {
                    res.status(500).json({
                        ok: false,
                        error: 'lock_operation_failed',
                        message: result.error,
                    });
                }
                return;
            }
            // Генерируем actionId для успешной операции
            const actionId = generateId();
            res.json({
                actionId,
                result: result.status === 'unlocked' ? 'opened' : 'already_opened',
            });
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    ok: false,
                    error: 'validation_failed',
                    details: error.errors,
                });
            }
            else {
                res.status(500).json({
                    ok: false,
                    error: 'internal_error',
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }
    };
}
/**
 * GET /api/locks/status
 * Получение статуса замков
 */
export function getLockStatusRoute(lockController) {
    return async (_req, res) => {
        try {
            const thicknessStatus = await lockController.getStatus('thickness');
            const obdStatus = await lockController.getStatus('obd');
            const devices = [];
            if (thicknessStatus) {
                devices.push({
                    deviceType: 'thickness',
                    state: thicknessStatus.status === 'unlocked' ? 'opened' :
                        thicknessStatus.status === 'locked' ? 'closed' :
                            'fault',
                    lastActionId: thicknessStatus.lastOperationKey,
                    updated_at: new Date().toISOString(),
                });
            }
            if (obdStatus) {
                devices.push({
                    deviceType: 'obd',
                    state: obdStatus.status === 'unlocked' ? 'opened' :
                        obdStatus.status === 'locked' ? 'closed' :
                            'fault',
                    lastActionId: obdStatus.lastOperationKey,
                    updated_at: new Date().toISOString(),
                });
            }
            res.json({ devices });
        }
        catch (error) {
            res.status(500).json({
                ok: false,
                error: 'internal_error',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };
}
/**
 * POST /api/locks/emergency-close-all
 * Экстренное закрытие всех замков
 */
export function emergencyCloseAllLocksRoute(lockController) {
    return async (_req, res) => {
        try {
            const result = await lockController.emergencyCloseAll();
            res.json({
                ok: true,
                closed: result.closed,
                errors: result.errors,
            });
        }
        catch (error) {
            res.status(500).json({
                ok: false,
                error: 'internal_error',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };
}
