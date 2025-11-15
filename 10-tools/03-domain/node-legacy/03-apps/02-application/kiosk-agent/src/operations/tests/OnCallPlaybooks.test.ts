import { test } from 'node:test';
import assert from 'node:assert';
import { OnCallPlaybooks } from '../OnCallPlaybooks.js';

test('OnCallPlaybooks - getPlaybook returns device_disconnected_obd', async () => {
  const playbooks = new OnCallPlaybooks();
  const playbook = await playbooks.getPlaybook('device_disconnected_obd');

  assert.ok(playbook !== null, 'Playbook should exist');
  assert.strictEqual(playbook!.name, 'device_disconnected_obd', 'Name should match');
  assert.strictEqual(playbook!.title, 'OBD-II адаптер не подключается', 'Title should match');
  assert.strictEqual(playbook!.estimatedTime, 10, 'Estimated time should be 10 minutes');
  assert.ok(Array.isArray(playbook!.symptoms), 'Symptoms should be an array');
  assert.ok(Array.isArray(playbook!.diagnosis), 'Diagnosis should be an array');
  assert.ok(Array.isArray(playbook!.resolution), 'Resolution should be an array');
});

test('OnCallPlaybooks - getPlaybook returns payment_failure_rate_high', async () => {
  const playbooks = new OnCallPlaybooks();
  const playbook = await playbooks.getPlaybook('payment_failure_rate_high');

  assert.ok(playbook !== null, 'Playbook should exist');
  assert.strictEqual(playbook!.name, 'payment_failure_rate_high', 'Name should match');
  assert.strictEqual(playbook!.title, 'Высокий процент неудачных платежей', 'Title should match');
  assert.strictEqual(playbook!.estimatedTime, 20, 'Estimated time should be 20 minutes');
});

test('OnCallPlaybooks - getPlaybook returns null for unknown', async () => {
  const playbooks = new OnCallPlaybooks();
  const playbook = await playbooks.getPlaybook('unknown_playbook');

  assert.strictEqual(playbook, null, 'Should return null for unknown playbook');
});

test('OnCallPlaybooks - listPlaybooks returns all', async () => {
  const playbooks = new OnCallPlaybooks();
  const list = await playbooks.listPlaybooks();

  assert.ok(Array.isArray(list), 'Should return an array');
  assert.ok(list.length >= 2, 'Should have at least 2 playbooks');
});

test('OnCallPlaybooks - createPlaybook adds new playbook', async () => {
  const playbooks = new OnCallPlaybooks();
  await playbooks.createPlaybook({
    name: 'test_playbook',
    title: 'Test Playbook',
    symptoms: ['Test symptom'],
    diagnosis: [{ step: 'Test step', expectedOutput: 'Test output' }],
    resolution: [{ step: 'Test resolution' }],
    escalation: 'Test escalation',
    estimatedTime: 5,
  });

  const playbook = await playbooks.getPlaybook('test_playbook');
  assert.ok(playbook !== null, 'New playbook should exist');
  assert.strictEqual(playbook!.name, 'test_playbook', 'Name should match');
});
