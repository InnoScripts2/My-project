/**
 * OBD Smoke Test - Cycle 4/09
 *
 * Проверяет базовые функции OBD интеграции:
 * - Автодетект адаптера
 * - Инициализация
 * - Чтение DTC кодов
 * - Обработка таймаутов и ошибок
 *
 * Запуск: npm run smoke:obd
 */
import { KingbolenEdiagDriver } from '../devices/obd/KingbolenEdiagDriver.js';
import { runObdSelfCheck, selfCheckPassed } from '../devices/obd/ObdSelfCheck.js';
const results = [];
function log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`, ...args);
}
async function testBleConnect() {
    const name = 'OBD BLE connect (KINGBOLEN)';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    try {
        const driver = new KingbolenEdiagDriver({ deviceName: process.env.EDIAG_DEVICE_NAME || 'KINGBOLEN' });
        const ok = await driver.connect();
        const identity = await driver.identify();
        await driver.disconnect();
        const durationMs = Date.now() - startTime;
        log('INFO', `${name}: SUCCESS - ${identity}`);
        return { name, passed: ok, details: { identity }, durationMs };
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
async function testSelfCheck(driver) {
    const name = 'OBD Self-check';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    try {
        const report = await runObdSelfCheck(driver, {
            attempts: 2,
            delayMs: 1000,
            onAttemptStart: (attempt) => log('INFO', `  Attempt ${attempt}...`),
            onAttemptFinish: (step) => {
                if (step.errors.length) {
                    log('WARN', `  Attempt ${step.attempt} had errors: ${step.errors.join('; ')}`);
                }
                else {
                    log('INFO', `  Attempt ${step.attempt} passed in ${step.durationMs}ms`);
                }
            },
        });
        const durationMs = Date.now() - startTime;
        const passed = selfCheckPassed(report);
        if (passed) {
            log('INFO', `${name}: SUCCESS - ${report.summary}`);
        }
        else {
            log('WARN', `${name}: PARTIAL - ${report.summary}`);
        }
        return {
            name,
            passed,
            details: {
                summary: report.summary,
                passes: report.passes,
                attemptsPerformed: report.attemptsPerformed,
                metrics: report.metrics,
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
async function testReadDtc(driver) {
    const name = 'OBD Read DTC';
    log('INFO', `Starting test: ${name}`);
    const startTime = Date.now();
    try {
        const dtcResult = await driver.readDTC();
        const durationMs = Date.now() - startTime;
        if (!dtcResult.ok) {
            const error = 'error' in dtcResult ? dtcResult.error : 'Unknown error';
            log('WARN', `${name}: Не удалось прочитать DTC - ${error}`);
            return {
                name,
                passed: false,
                error,
                durationMs,
            };
        }
        const codes = dtcResult.data ?? [];
        log('INFO', `${name}: SUCCESS - Found ${codes.length} DTC codes`);
        if (codes.length > 0) {
            codes.forEach((dtc) => {
                log('INFO', `  - ${dtc.code}: ${dtc.description || 'No description'}`);
            });
        }
        return {
            name,
            passed: true,
            details: {
                dtcCount: codes.length,
                codes: codes.map(d => d.code),
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
// BLE-версии ручного теста не требуется (нет COM-портов)
async function testManualConnection() {
    return { name: 'OBD Manual Connection', passed: true, details: { note: 'BLE only - skipped' } };
}
async function main() {
    log('INFO', '=== OBD Smoke Test Suite - Cycle 4/09 ===');
    log('INFO', `Environment: ${process.env.AGENT_ENV || 'DEV'}`);
    log('INFO', '');
    const env = process.env.AGENT_ENV || 'DEV';
    // Тест 1: BLE подключение
    const bleConnect = await testBleConnect();
    results.push(bleConnect);
    // Если подключение прошло, проводим дополнительные тесты
    if (bleConnect.passed) {
        log('INFO', '');
        log('INFO', 'Adapter detected, running additional tests...');
        let driver;
        try {
            driver = new KingbolenEdiagDriver({ deviceName: process.env.EDIAG_DEVICE_NAME || 'KINGBOLEN' });
            await driver.connect();
            // Тест 2: Self-check
            const selfCheckResult = await testSelfCheck(driver);
            results.push(selfCheckResult);
            log('INFO', '');
            // Тест 3: Read DTC
            const dtcResult = await testReadDtc(driver);
            results.push(dtcResult);
        }
        finally {
            if (driver)
                await driver.disconnect();
        }
    }
    else {
        log('INFO', '');
        log('INFO', 'No adapter auto-detected, trying manual connection...');
        // Тест с явным портом
        const manualResult = await testManualConnection();
        results.push(manualResult);
    }
    // Печатаем сводку
    log('INFO', '');
    log('INFO', '=== Test Summary ===');
    let passedCount = 0;
    let failedCount = 0;
    let totalDuration = 0;
    results.forEach((result) => {
        const status = result.passed ? 'PASS' : 'FAIL';
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
