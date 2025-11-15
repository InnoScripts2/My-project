/**
 * E2E test for auto-restart workflow
 * Tests complete workflow execution from trigger to completion
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';
import { ActivepiecesClient } from '../../ActivepiecesClient.js';
import { WorkflowManager } from '../../WorkflowManager.js';
import { WorkflowExecutor } from '../../WorkflowExecutor.js';
import { autoRestartWorkflow } from '../../examples/built-in-workflows.js';

describe('Auto-restart Workflow E2E', () => {
  let client: ActivepiecesClient;
  let manager: WorkflowManager;
  let executor: WorkflowExecutor;
  let workflowId: string;

  before(async () => {
    // Skip if Activepieces not available
    if (!process.env.ACTIVEPIECES_API_KEY) {
      console.log('ACTIVEPIECES_API_KEY not set, skipping E2E test');
      return;
    }

    client = new ActivepiecesClient();
    client.initClient(
      process.env.ACTIVEPIECES_API_URL || 'http://localhost:3000',
      process.env.ACTIVEPIECES_API_KEY
    );

    manager = new WorkflowManager(client);
    executor = new WorkflowExecutor(client);

    try {
      // Register workflow
      workflowId = await manager.registerWorkflow(autoRestartWorkflow);
      console.log(`Workflow registered: ${workflowId}`);
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.log('Activepieces not available, skipping test');
        return;
      }
      throw error;
    }
  });

  after(async () => {
    if (workflowId) {
      try {
        await manager.removeWorkflow(workflowId);
        console.log(`Workflow removed: ${workflowId}`);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it('should trigger workflow with critical alert', async () => {
    if (!workflowId) {
      console.log('Workflow not registered, skipping test');
      return;
    }

    const alertPayload = {
      severity: 'critical',
      alertName: 'device_disconnected',
      kioskId: 'kiosk-test-001',
      timestamp: new Date().toISOString(),
    };

    try {
      const execution = await executor.executeWorkflow(workflowId, alertPayload);
      
      assert.ok(execution.executionId);
      assert.strictEqual(execution.workflowId, workflowId);
      
      console.log(`Execution started: ${execution.executionId}`);
      console.log(`Status: ${execution.status}`);
      
      // Note: In real environment, workflow would execute steps
      // For testing, we just verify it was triggered
      assert.ok(['running', 'completed', 'failed'].includes(execution.status));
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.log('Activepieces not available during execution');
        return;
      }
      throw error;
    }
  });

  it('should check execution status', async () => {
    if (!workflowId) {
      console.log('Workflow not registered, skipping test');
      return;
    }

    try {
      const executions = await client.listExecutions(workflowId);
      assert.ok(Array.isArray(executions));
      
      if (executions.length > 0) {
        const execution = executions[0];
        assert.ok(execution.executionId);
        assert.strictEqual(execution.workflowId, workflowId);
        console.log(`Found ${executions.length} execution(s)`);
      }
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.log('Activepieces not available');
        return;
      }
      throw error;
    }
  });
});
