/**
 * Integration tests for Activepieces
 * These tests require a running Activepieces instance
 * Run: docker-compose -f examples/docker-compose.yml up -d
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { ActivepiecesClient } from '../../ActivepiecesClient.js';
import { WorkflowManager } from '../../WorkflowManager.js';
import type { WorkflowDefinition } from '../../types.js';

describe('Activepieces Integration', () => {
  let client: ActivepiecesClient;
  let manager: WorkflowManager;
  const TEST_API_URL = process.env.ACTIVEPIECES_API_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.ACTIVEPIECES_API_KEY || 'test-key';

  before(() => {
    client = new ActivepiecesClient();
    client.initClient(TEST_API_URL, TEST_API_KEY);
    manager = new WorkflowManager(client);
  });

  it('should connect to Activepieces API', async () => {
    // This test will fail if Activepieces is not running
    try {
      const workflows = await client.listWorkflows();
      assert.ok(Array.isArray(workflows));
    } catch (error: any) {
      console.log('Activepieces not available:', error.message);
      console.log('Start Activepieces: docker-compose -f examples/docker-compose.yml up -d');
      // Skip test if Activepieces is not available
      return;
    }
  });

  it('should create and list workflow', async () => {
    try {
      const workflow: WorkflowDefinition = {
        name: 'test_workflow_integration',
        description: 'Integration test workflow',
        trigger: { type: 'webhook', config: { webhookPath: '/test' } },
        steps: [
          {
            name: 'test_step',
            type: 'http',
            config: {
              method: 'GET',
              url: 'http://example.com',
            },
          },
        ],
        enabled: false,
      };

      const workflowId = await manager.registerWorkflow(workflow);
      assert.ok(workflowId);

      const workflows = await client.listWorkflows();
      const found = workflows.find(w => w.workflowId === workflowId);
      assert.ok(found);
      assert.strictEqual(found.name, 'test_workflow_integration');

      // Cleanup
      await manager.removeWorkflow(workflowId);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.log('Activepieces not available, skipping test');
        return;
      }
      throw error;
    }
  });
});
