/**
 * Тесты для Green API Client
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { GreenApiClient } from './client.js';

test('GreenApiClient создаётся с правильной конфигурацией', () => {
  const config = {
    idInstance: '1105335604',
    apiTokenInstance: 'test-token'
  };

  const client = new GreenApiClient(config);
  assert.ok(client);
});

test('GreenApiClient использует дефолтный URL', () => {
  const config = {
    idInstance: '1105335604',
    apiTokenInstance: 'test-token'
  };

  const client = new GreenApiClient(config);
  // @ts-ignore - доступ к приватному полю для тестирования
  assert.strictEqual(client.config.apiUrl, 'https://1105.api.green-api.com');
});

test('GreenApiClient использует кастомный URL', () => {
  const config = {
    idInstance: '1105335604',
    apiTokenInstance: 'test-token',
    apiUrl: 'https://custom.api.green-api.com'
  };

  const client = new GreenApiClient(config);
  // @ts-ignore
  assert.strictEqual(client.config.apiUrl, 'https://custom.api.green-api.com');
});
