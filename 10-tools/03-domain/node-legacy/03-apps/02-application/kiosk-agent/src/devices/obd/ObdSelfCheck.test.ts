import test from 'node:test';
import assert from 'node:assert/strict';
import type { ObdDtc, ObdLiveData, ObdResult, ObdStatus } from './KingbolenEdiagDriver.js';
import { runObdSelfCheck, selfCheckPassed } from './ObdSelfCheck.js';

class StubDriver {
  constructor(
    private readonly responses: {
      status: ObdResult<ObdStatus>;
      live: ObdResult<ObdLiveData>;
      dtc: ObdResult<ObdDtc[]>;
    }[],
  ) {}

  private index = 0;

  private current() {
    return this.responses[Math.min(this.index, this.responses.length - 1)];
  }

  async readStatus(): Promise<ObdResult<ObdStatus>> {
    const { status } = this.current();
    return clone(status);
  }

  async readLiveData(): Promise<ObdResult<ObdLiveData>> {
    const { live } = this.current();
    return clone(live);
  }

  async readDTC(): Promise<ObdResult<ObdDtc[]>> {
    const { dtc } = this.current();
    this.index += 1;
    return clone(dtc);
  }
}

function clone<T>(value: T): T {
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

  const report = await runObdSelfCheck(driver as any, { attempts: 2, delayMs: 0 });
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

  const report = await runObdSelfCheck(driver as any, { attempts: 2, delayMs: 0 });
  assert.equal(report.passes, 0);
  assert.equal(report.fails, 2);
  assert.equal(report.steps[0].errors[0], 'status: status timeout');
  assert.match(report.summary, /2 attempts: 0 passed, 2 failed/);
  assert.equal(selfCheckPassed(report), false);
});

function fakeStatus(overrides: Partial<ObdStatus>): ObdStatus {
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

function fakeLive(overrides: Partial<ObdLiveData>): ObdLiveData {
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

function fakeDtc(code: string): ObdDtc {
  return { code };
}
