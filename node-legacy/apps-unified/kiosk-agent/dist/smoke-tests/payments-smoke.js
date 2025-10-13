/**
 * Payments Smoke Test - Cycle 4/09
 *
 * Проверяет базовые функции платежной интеграции (только DEV):
 * - Создание интента
 * - Проверка статуса
 * - DEV-подтверждение (только в DEV)
 *
 * ВАЖНО: В PROD этот тест должен быть недоступен или пропущен
 *
 * Запуск: npm run smoke:payments
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const results = [];
function log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`, ...args);
}
async function loadPaymentModules() {
    // Import from built dist (avoids ts-node/esm circular dependency issues)
    const paymentsPath = join(__dirname, '../../../../../02-domains/03-domain/payments/dist/index.js');
    return await import(paymentsPath);
}
async function testCreateIntent(service) {
    const name = 'Payment Create Intent';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    try {
        const intent = await service.createIntent(480, 'RUB', {
            service: 'obd',
            sessionId: 'smoke-test-session',
        });
        const durationMs = Date.now() - startTime;
        if (!intent.id) {
            throw new Error('Intent ID not returned');
        }
        if (intent.amount !== 480) {
            throw new Error(`Expected amount 480, got ${intent.amount}`);
        }
        if (intent.currency !== 'RUB') {
            throw new Error(`Expected currency RUB, got ${intent.currency}`);
        }
        if (intent.status !== 'pending') {
            throw new Error(`Expected status pending, got ${intent.status}`);
        }
        log('INFO', `${name}: SUCCESS`);
        log('INFO', `  Intent ID: ${intent.id}`);
        log('INFO', `  Amount: ${intent.amount} ${intent.currency}`);
        log('INFO', `  Status: ${intent.status}`);
        return {
            name,
            passed: true,
            details: {
                intentId: intent.id,
                amount: intent.amount,
                currency: intent.currency,
                status: intent.status,
            },
            durationMs,
        };
    }
    catch (error) {
        const durationMs = Date.now() - startTime;
        log('ERROR', `${name}: FAILED - ${error.message}`);
        return {
            name,
            passed: false,
            error: error.message,
            durationMs,
        };
    }
}
async function testGetStatus(service, intentId) {
    const name = 'Payment Get Status';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    try {
        const status = await service.getStatus(intentId);
        const durationMs = Date.now() - startTime;
        if (!status) {
            throw new Error('Status not returned');
        }
        log('INFO', `${name}: SUCCESS`);
        log('INFO', `  Status: ${status}`);
        return {
            name,
            passed: true,
            details: {
                intentId,
                status,
            },
            durationMs,
        };
    }
    catch (error) {
        const durationMs = Date.now() - startTime;
        log('ERROR', `${name}: FAILED - ${error.message}`);
        return {
            name,
            passed: false,
            error: error.message,
            durationMs,
        };
    }
}
async function testGetIntent(service, intentId) {
    const name = 'Payment Get Intent';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    try {
        const intent = await service.getIntent(intentId);
        const durationMs = Date.now() - startTime;
        if (!intent) {
            throw new Error('Intent not returned');
        }
        if (intent.id !== intentId) {
            throw new Error(`Expected intent ID ${intentId}, got ${intent.id}`);
        }
        log('INFO', `${name}: SUCCESS`);
        log('INFO', `  Intent ID: ${intent.id}`);
        log('INFO', `  Amount: ${intent.amount} ${intent.currency}`);
        log('INFO', `  Status: ${intent.status}`);
        if (intent.history && intent.history.length > 0) {
            log('INFO', `  History entries: ${intent.history.length}`);
        }
        return {
            name,
            passed: true,
            details: {
                intentId: intent.id,
                amount: intent.amount,
                status: intent.status,
                historyLength: intent.history?.length || 0,
            },
            durationMs,
        };
    }
    catch (error) {
        const durationMs = Date.now() - startTime;
        log('ERROR', `${name}: FAILED - ${error.message}`);
        return {
            name,
            passed: false,
            error: error.message,
            durationMs,
        };
    }
}
async function testConfirmDevOnly(service, intentId) {
    const name = 'Payment Confirm (DEV-only)';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    const env = process.env.AGENT_ENV || 'DEV';
    if (env === 'PROD') {
        log('INFO', `${name}: SKIPPED in PROD (DEV-only feature)`);
        return {
            name,
            passed: true,
            details: { note: 'Skipped in PROD - DEV-only feature' },
        };
    }
    try {
        const confirmedIntent = await service.confirmDevPayment(intentId);
        const durationMs = Date.now() - startTime;
        if (confirmedIntent.status !== 'succeeded') {
            throw new Error(`Expected status succeeded, got ${confirmedIntent.status}`);
        }
        log('INFO', `${name}: SUCCESS`);
        log('INFO', `  Intent ID: ${confirmedIntent.id}`);
        log('INFO', `  Status: ${confirmedIntent.status}`);
        return {
            name,
            passed: true,
            details: {
                intentId: confirmedIntent.id,
                status: confirmedIntent.status,
            },
            durationMs,
        };
    }
    catch (error) {
        const durationMs = Date.now() - startTime;
        log('ERROR', `${name}: FAILED - ${error.message}`);
        return {
            name,
            passed: false,
            error: error.message,
            durationMs,
        };
    }
}
async function testStatusPolling(service, intentId) {
    const name = 'Payment Status Polling';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    try {
        // Симулируем polling: проверяем статус несколько раз с задержкой
        const pollCount = 3;
        const pollDelayMs = 100;
        log('INFO', `  Polling ${pollCount} times with ${pollDelayMs}ms delay...`);
        for (let i = 0; i < pollCount; i++) {
            const status = await service.getStatus(intentId);
            log('INFO', `  Poll ${i + 1}/${pollCount}: ${status}`);
            if (i < pollCount - 1) {
                await new Promise(resolve => setTimeout(resolve, pollDelayMs));
            }
        }
        const durationMs = Date.now() - startTime;
        log('INFO', `${name}: SUCCESS - Polled ${pollCount} times`);
        return {
            name,
            passed: true,
            details: {
                pollCount,
                pollDelayMs,
            },
            durationMs,
        };
    }
    catch (error) {
        const durationMs = Date.now() - startTime;
        log('ERROR', `${name}: FAILED - ${error.message}`);
        return {
            name,
            passed: false,
            error: error.message,
            durationMs,
        };
    }
}
async function main() {
    log('INFO', '=== Payments Smoke Test Suite - Cycle 4/09 ===');
    log('INFO', `Environment: ${process.env.AGENT_ENV || 'DEV'}`);
    log('INFO', '');
    const env = process.env.AGENT_ENV || 'DEV';
    if (env === 'PROD') {
        log('ERROR', 'CRITICAL: Payment smoke tests cannot run in PROD environment!');
        log('ERROR', 'These tests use DEV-only payment provider.');
        log('ERROR', 'In PROD, use real payment provider integration tests.');
        process.exit(1);
    }
    // Load payment modules
    const { PaymentService, DevPaymentProvider } = await loadPaymentModules();
    // Создаем DEV payment service
    const provider = new DevPaymentProvider();
    const service = new PaymentService(provider, {
        environment: 'DEV',
    });
    log('INFO', 'Using DevPaymentProvider (DEV-only)');
    log('INFO', '');
    // Тест 1: Create intent
    const createResult = await testCreateIntent(service);
    results.push(createResult);
    if (!createResult.passed || !createResult.details?.intentId) {
        log('ERROR', 'Cannot continue without valid intent ID');
        printSummary();
        process.exit(1);
    }
    const intentId = createResult.details.intentId;
    log('INFO', '');
    // Тест 2: Get status
    results.push(await testGetStatus(service, intentId));
    log('INFO', '');
    // Тест 3: Get intent
    results.push(await testGetIntent(service, intentId));
    log('INFO', '');
    // Тест 4: Confirm DEV-only
    results.push(await testConfirmDevOnly(service, intentId));
    log('INFO', '');
    // Тест 5: Status polling
    results.push(await testStatusPolling(service, intentId));
    printSummary();
}
function printSummary() {
    // Печатаем сводку
    log('INFO', '');
    log('INFO', '=== Test Summary ===');
    let passedCount = 0;
    let failedCount = 0;
    let totalDuration = 0;
    results.forEach((result) => {
        const status = result.passed ? '✓ PASS' : '✗ FAIL';
        const duration = result.durationMs ? ` (${result.durationMs}ms)` : '';
        log('INFO', `${status}: ${result.name}${duration}`);
        if (result.error) {
            log('INFO', `  Error: ${result.error}`);
        }
        if (result.passed) {
            passedCount++;
        }
        else {
            failedCount++;
        }
        if (result.durationMs) {
            totalDuration += result.durationMs;
        }
    });
    log('INFO', '');
    log('INFO', `Total: ${passedCount} passed, ${failedCount} failed`);
    log('INFO', `Total duration: ${totalDuration}ms`);
    log('INFO', '');
    if (failedCount > 0) {
        log('WARN', 'Some tests failed. Review errors above.');
        process.exit(2);
    }
    log('INFO', 'All smoke tests passed!');
    process.exit(0);
}
// Запуск
main().catch((error) => {
    log('ERROR', 'Fatal error in smoke test:', error);
    process.exit(3);
});
