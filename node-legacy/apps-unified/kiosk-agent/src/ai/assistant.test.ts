import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchAiInsights, buildPayloadFromDtc } from './assistant.js';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function setSupabaseEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_KEY = 'test-key';
}

test('fetchAiInsights parses JSON summary/severity when model returns JSON string', async () => {
  setSupabaseEnv();
  globalThis.fetch = (async (_url: any, _opts: any) => ({
    async json() {
      return { message: JSON.stringify({ summary: 'Краткий вывод', severity: { critical: 1 } }) };
    }
  })) as any;

  const res = await fetchAiInsights({ dtc: [{ code: 'P0301' }] });
  assert.equal(res.summary, 'Краткий вывод');
  assert.equal(res.severity?.critical, 1);
});

test('fetchAiInsights falls back to free-form text when JSON parse fails', async () => {
  setSupabaseEnv();
  globalThis.fetch = (async (_url: any, _opts: any) => ({
    async json() {
      return { message: 'Свободный текст без JSON' };
    }
  })) as any;

  const res = await fetchAiInsights({ dtc: [{ code: 'P0300' }] });
  assert.equal(res.summary, 'Свободный текст без JSON');
  assert.ok(res.disclaimer && res.disclaimer.length > 0);
});

test('fetchAiInsights throws ai_not_configured if SUPABASE env is missing', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_KEY;
  globalThis.fetch = originalFetch as any; // not used

  const err = await fetchAiInsights({ dtc: [] }).then(
    () => null,
    (e) => e
  );
  assert.ok(err, 'must throw');
  assert.equal(err.code || err.message, 'ai_not_configured');
});

test('buildPayloadFromDtc maps DTC codes and descriptions', () => {
  const payload = buildPayloadFromDtc([
    { code: 'P0420', description: 'Catalyst System Efficiency Below Threshold', severity: 'warning' } as any,
  ], { mil: true } as any);
  assert.deepEqual(payload.dtc, [{ code: 'P0420', description: 'Catalyst System Efficiency Below Threshold' }]);
  assert.equal((payload.status as any).mil, true);
});

test.after(() => {
  process.env = { ...originalEnv } as any;
  globalThis.fetch = originalFetch as any;
});
