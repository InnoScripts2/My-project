/**
 * Unit tests for ActivepiecesClient
 */

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ActivepiecesClient } from '../ActivepiecesClient.js';
import type { WorkflowDefinition } from '../types.js';

describe('ActivepiecesClient', () => {
  let client: ActivepiecesClient;

  beforeEach(() => {
    client = new ActivepiecesClient();
  });

  it('should initialize client with API URL and key', () => {
    assert.doesNotThrow(() => {
      client.initClient('http://localhost:3000', 'test-api-key');
    });
  });

  it('should throw error when creating workflow without initialization', async () => {
    const workflow: WorkflowDefinition = {
      name: 'test_workflow',
      description: 'Test workflow',
      trigger: { type: 'webhook', config: { webhookPath: '/test' } },
      steps: [],
      enabled: true,
    };

    await assert.rejects(
      async () => await client.createWorkflow(workflow),
      /Client not initialized/
    );
  });

  it('should throw error when listing workflows without initialization', async () => {
    await assert.rejects(
      async () => await client.listWorkflows(),
      /Client not initialized/
    );
  });

  it('should throw error when triggering workflow without initialization', async () => {
    await assert.rejects(
      async () => await client.triggerWorkflow('wf-001', {}),
      /Client not initialized/
    );
  });

  it('should throw error when getting execution without initialization', async () => {
    await assert.rejects(
      async () => await client.getExecution('ex-001'),
      /Client not initialized/
    );
  });
});
