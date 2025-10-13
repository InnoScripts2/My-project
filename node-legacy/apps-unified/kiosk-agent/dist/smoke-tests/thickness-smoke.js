/**
 * Thickness Smoke Test - Cycle 4/09
 *
 * Проверяет базовые функции интеграции толщиномера:
 * - Подключение/инициализация
 * - Получение состояния
 * - Создание сессии
 * - Без генерации псевдоданных (только реальные данные от устройства)
 *
 * Запуск: npm run smoke:thickness
 */
import { thicknessManager, getPointsTemplate } from '../devices/thickness/ThicknessManager.js';
const results = [];
function log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`, ...args);
}
async function testGetSnapshot() {
    const name = 'Thickness Snapshot';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    try {
        const snapshot = thicknessManager.getSnapshot();
        const durationMs = Date.now() - startTime;
        log('INFO', `${name}: SUCCESS - State: ${snapshot.state}`);
        return {
            name,
            passed: true,
            details: {
                state: snapshot.state,
                deviceName: snapshot.deviceName,
                lastConnectedAt: snapshot.lastConnectedAt,
                lastError: snapshot.lastError,
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
async function testPointsTemplate() {
    const name = 'Thickness Points Template';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    try {
        const sedanPoints = getPointsTemplate('sedan');
        const hatchbackPoints = getPointsTemplate('hatchback');
        const minivanPoints = getPointsTemplate('minivan');
        const durationMs = Date.now() - startTime;
        log('INFO', `${name}: SUCCESS`);
        log('INFO', `  Sedan: ${sedanPoints.length} points`);
        log('INFO', `  Hatchback: ${hatchbackPoints.length} points`);
        log('INFO', `  Minivan: ${minivanPoints.length} points`);
        // Проверяем, что есть минимум 24 точки для каждого типа
        if (sedanPoints.length < 24 || hatchbackPoints.length < 24 || minivanPoints.length < 24) {
            throw new Error('Expected at least 24 points for each vehicle type');
        }
        return {
            name,
            passed: true,
            details: {
                sedan: sedanPoints.length,
                hatchback: hatchbackPoints.length,
                minivan: minivanPoints.length,
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
async function testOpen() {
    const name = 'Thickness Open Connection';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    try {
        // В DEV мы можем открыть соединение с mock-конфигом
        const result = await thicknessManager.open({
            vehicleType: 'sedan',
            ble: {
                deviceName: 'DEV-THK-SMOKE',
                serviceUuid: '0000',
            },
        });
        const durationMs = Date.now() - startTime;
        if (!result.ok) {
            log('WARN', `${name}: Connection failed - ${result.error}`);
            return {
                name,
                passed: false,
                error: result.error,
                durationMs,
            };
        }
        const snapshot = thicknessManager.getSnapshot();
        log('INFO', `${name}: SUCCESS - State: ${snapshot.state}`);
        log('INFO', `  Device: ${snapshot.deviceName}`);
        return {
            name,
            passed: true,
            details: {
                state: snapshot.state,
                deviceName: snapshot.deviceName,
                serviceUuid: snapshot.serviceUuid,
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
async function testSession() {
    const name = 'Thickness Session Management';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    try {
        // Начинаем сессию
        const session = await thicknessManager.startSession({ vehicleType: 'sedan' });
        log('INFO', `  Session started with ${session.pendingCount} pending points`);
        if (!session.active) {
            throw new Error('Session should be active after start');
        }
        if (session.pendingCount < 24) {
            throw new Error('Expected at least 24 pending points');
        }
        // Получаем снапшот сессии
        const sessionSnapshot = thicknessManager.getSessionSnapshot();
        if (sessionSnapshot.pendingCount !== session.pendingCount) {
            throw new Error('Session snapshot mismatch');
        }
        // Останавливаем сессию
        await thicknessManager.stopSession();
        const afterStop = thicknessManager.getSessionSnapshot();
        if (afterStop.active) {
            throw new Error('Session should not be active after stop');
        }
        const durationMs = Date.now() - startTime;
        log('INFO', `${name}: SUCCESS`);
        log('INFO', `  Session had ${session.pendingCount} points`);
        log('INFO', `  Session stopped successfully`);
        return {
            name,
            passed: true,
            details: {
                initialPendingCount: session.pendingCount,
                stoppedActive: afterStop.active,
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
async function testDevMarkPoint() {
    const name = 'Thickness DEV Mark Point';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    const env = process.env.AGENT_ENV || 'DEV';
    if (env === 'PROD') {
        log('INFO', `${name}: SKIPPED in PROD (DEV-only feature)`);
        return {
            name,
            passed: true,
            details: { note: 'Skipped in PROD' },
        };
    }
    try {
        // Начинаем сессию
        await thicknessManager.startSession({ vehicleType: 'sedan' });
        // В DEV можем пометить точку как пропущенную
        const result = thicknessManager.markPoint();
        if (!result.ok) {
            throw new Error(`Mark point failed: ${result.error}`);
        }
        if (result.session.skippedCount !== 1) {
            throw new Error(`Expected 1 skipped point, got ${result.session.skippedCount}`);
        }
        log('INFO', `${name}: SUCCESS - Marked 1 point as skipped in DEV`);
        // Останавливаем сессию
        await thicknessManager.stopSession();
        const durationMs = Date.now() - startTime;
        return {
            name,
            passed: true,
            details: {
                skippedCount: result.session.skippedCount,
            },
            durationMs,
        };
    }
    catch (error) {
        const durationMs = Date.now() - startTime;
        log('ERROR', `${name}: FAILED - ${error.message}`);
        // Пытаемся остановить сессию в случае ошибки
        try {
            await thicknessManager.stopSession();
        }
        catch (stopError) {
            // Игнорируем ошибки остановки
        }
        return {
            name,
            passed: false,
            error: error.message,
            durationMs,
        };
    }
}
async function main() {
    log('INFO', '=== Thickness Smoke Test Suite - Cycle 4/09 ===');
    log('INFO', `Environment: ${process.env.AGENT_ENV || 'DEV'}`);
    log('INFO', '');
    const env = process.env.AGENT_ENV || 'DEV';
    // Тест 1: Get snapshot
    results.push(await testGetSnapshot());
    log('INFO', '');
    // Тест 2: Points template
    results.push(await testPointsTemplate());
    log('INFO', '');
    // Тест 3: Open connection
    results.push(await testOpen());
    log('INFO', '');
    // Тест 4: Session management
    results.push(await testSession());
    log('INFO', '');
    // Тест 5: DEV mark point (только в DEV)
    results.push(await testDevMarkPoint());
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
    if (env === 'PROD' && failedCount > 0) {
        log('ERROR', 'CRITICAL: Smoke tests failed in PROD environment!');
        process.exit(1);
    }
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
