import test from 'node:test';
import assert from 'node:assert/strict';
import { runObdSelfCheck, selfCheckPassed } from './ObdSelfCheck.js';
class StubDriver {
    constructor(responses) {
        this.responses = responses;
        this.index = 0;
    }
    current() {
        return this.responses[Math.min(this.index, this.responses.length - 1)];
    }
    async readStatus() {
        const { status } = this.current();
        return clone(status);
    }
    async readLiveData() {
        const { live } = this.current();
        return clone(live);
    }
    async readDTC() {
        const { dtc } = this.current();
        this.index += 1;
        return clone(dtc);
    }
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
test('runObdSelfCheck aggregates successful attempts and marks consistency', async () => {
    const driver = new StubDriver([
        {
            status: { ok: true, data: fakeStatus({ mil: false }) },
            live: { ok: true, data: fakeLive({ rpm: 800 }) },
            dtc: { ok: true, data: [] },
        },
        {
            status: { ok: true, data: fakeStatus({ mil: false }) },
            live: { ok: true, data: fakeLive({ rpm: 805 }) },
            dtc: { ok: true, data: [] },
        },
    ]);
    const report = await runObdSelfCheck(driver, { attempts: 2, delayMs: 0 });
    assert.equal(report.attemptsPerformed, 2);
    assert.equal(report.passes, 2);
    assert.equal(report.fails, 0);
    assert.equal(report.consistent, false);
    assert.ok(report.metrics.rpm);
    assert.ok(selfCheckPassed({ ...report, consistent: true }));
});
test('runObdSelfCheck captures errors and surfaces summary', async () => {
    const driver = new StubDriver([
        {
            status: { ok: false, error: 'status timeout' },
            live: { ok: true, data: fakeLive({}) },
            dtc: { ok: true, data: [fakeDtc('P0001')] },
        },
        {
            status: { ok: true, data: fakeStatus({ mil: true }) },
            live: { ok: false, error: 'live failed' },
            dtc: { ok: true, data: [fakeDtc('P0001')] },
        },
    ]);
    const report = await runObdSelfCheck(driver, { attempts: 2, delayMs: 0 });
    assert.equal(report.passes, 0);
    assert.equal(report.fails, 2);
    assert.equal(report.steps[0].errors[0], 'status: status timeout');
    assert.match(report.summary, /2 attempts: 0 passed, 2 failed/);
    assert.equal(selfCheckPassed(report), false);
});
function fakeStatus(overrides) {
    return {
        mil: true,
        dtcCount: 1,
        readiness: {
            misfire: true,
            fuelSystem: true,
            components: true,
            catalyst: true,
            heatedCatalyst: true,
            evapSystem: true,
            secondaryAirSystem: true,
            acRefrigerant: true,
            oxygenSensor: true,
            oxygenSensorHeater: true,
            egrSystem: true,
        },
        ...overrides,
    };
}
function fakeLive(overrides) {
    return {
        rpm: 650,
        coolantTemp: 75,
        intakeTemp: 20,
        speed: 0,
        voltage: 12.6,
        throttle: 12,
        ...overrides,
    };
}
function fakeDtc(code) {
    return { code };
}
