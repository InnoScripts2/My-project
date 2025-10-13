/**
 * Тесты для детектора аномалий
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AnomalyDetector } from './AnomalyDetector.js';
import { CentralizedLogger } from './CentralizedLogger.js';
describe('AnomalyDetector', async () => {
    let detector;
    let logger;
    beforeEach(() => {
        detector = new AnomalyDetector();
        logger = new CentralizedLogger({ enableConsole: false });
    });
    await describe('error_storm', async () => {
        await it('детектирует шторм ошибок', () => {
            // Генерируем 12 ошибок за короткий период
            for (let i = 0; i < 12; i++) {
                logger.error('obd', `Error ${i}`);
            }
            const entries = logger.tail(100);
            const anomalies = detector.detect(entries);
            assert.strictEqual(anomalies.length, 1);
            assert.strictEqual(anomalies[0].patternId, 'error_storm');
            assert.strictEqual(anomalies[0].severity, 'critical');
            assert.ok(anomalies[0].description.includes('12'));
        });
        await it('не детектирует при малом количестве ошибок', () => {
            for (let i = 0; i < 5; i++) {
                logger.error('obd', `Error ${i}`);
            }
            const entries = logger.tail(100);
            const anomalies = detector.detect(entries);
            const errorStorm = anomalies.find((a) => a.patternId === 'error_storm');
            assert.strictEqual(errorStorm, undefined);
        });
    });
    await describe('connection_failures', async () => {
        await it('детектирует частые сбои подключения', () => {
            for (let i = 0; i < 6; i++) {
                logger.error('obd', 'Connection failed to adapter');
            }
            const entries = logger.tail(100);
            const anomalies = detector.detect(entries);
            const connectionFailures = anomalies.find((a) => a.patternId === 'connection_failures');
            assert.ok(connectionFailures);
            assert.strictEqual(connectionFailures?.severity, 'high');
            assert.ok(connectionFailures?.description.includes('сбоев подключения'));
        });
        await it('работает с русскими сообщениями', () => {
            for (let i = 0; i < 6; i++) {
                logger.error('obd', 'Ошибка подключения к адаптеру');
            }
            const entries = logger.tail(100);
            const anomalies = detector.detect(entries);
            const connectionFailures = anomalies.find((a) => a.patternId === 'connection_failures');
            assert.ok(connectionFailures);
        });
    });
    await describe('payment_delays', async () => {
        await it('детектирует задержки платежей', () => {
            for (let i = 0; i < 4; i++) {
                logger.warn('payments', 'Payment intent_123 pending for 95 seconds');
            }
            const entries = logger.tail(100);
            const anomalies = detector.detect(entries);
            const paymentDelays = anomalies.find((a) => a.patternId === 'payment_delays');
            assert.ok(paymentDelays);
            assert.strictEqual(paymentDelays?.severity, 'medium');
        });
    });
    await describe('repeated_same_error', async () => {
        await it('детектирует повторяющуюся ошибку', () => {
            for (let i = 0; i < 6; i++) {
                logger.error('thk', 'BLE connection timeout');
            }
            const entries = logger.tail(100);
            const anomalies = detector.detect(entries);
            const repeated = anomalies.find((a) => a.patternId === 'repeated_same_error');
            assert.ok(repeated);
            assert.strictEqual(repeated?.severity, 'high');
            assert.ok(repeated?.metrics?.repeatCount);
            assert.ok(repeated?.metrics?.repeatCount >= 6);
        });
        await it('не детектирует разные ошибки', () => {
            for (let i = 0; i < 6; i++) {
                logger.error('thk', `Different error ${i}`);
            }
            const entries = logger.tail(100);
            const anomalies = detector.detect(entries);
            const repeated = anomalies.find((a) => a.patternId === 'repeated_same_error');
            assert.strictEqual(repeated, undefined);
        });
    });
    await describe('throttle_warning', async () => {
        await it('детектирует превышение частоты запросов', () => {
            for (let i = 0; i < 110; i++) {
                logger.debug('obd', `Request ${i}`);
            }
            const entries = logger.tail(200);
            const anomalies = detector.detect(entries);
            const throttle = anomalies.find((a) => a.patternId === 'throttle_warning');
            assert.ok(throttle);
            assert.strictEqual(throttle?.severity, 'medium');
            assert.ok(throttle?.metrics?.requestCount);
            assert.ok(throttle?.metrics?.requestCount >= 110);
        });
    });
    await describe('getDetectedAnomalies', async () => {
        beforeEach(() => {
            // Генерируем несколько аномалий
            for (let i = 0; i < 12; i++) {
                logger.error('obd', `Error ${i}`);
            }
            detector.detect(logger.tail(100));
        });
        await it('возвращает все аномалии', () => {
            const anomalies = detector.getDetectedAnomalies();
            assert.ok(anomalies.length > 0);
        });
        await it('фильтрует по severity', () => {
            const critical = detector.getDetectedAnomalies({ severity: 'critical' });
            assert.ok(critical.every((a) => a.severity === 'critical'));
        });
    });
    await describe('clearAnomalies', async () => {
        await it('очищает историю аномалий', () => {
            for (let i = 0; i < 12; i++) {
                logger.error('obd', `Error ${i}`);
            }
            detector.detect(logger.tail(100));
            detector.clearAnomalies();
            const anomalies = detector.getDetectedAnomalies();
            assert.strictEqual(anomalies.length, 0);
        });
    });
});
