/**
 * E2E test for daily cleanup workflow
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { ActivepiecesClient } from '../../ActivepiecesClient.js';
import { WorkflowManager } from '../../WorkflowManager.js';
import { WorkflowExecutor } from '../../WorkflowExecutor.js';
import { dailyCleanupWorkflow } from '../../examples/built-in-workflows.js';

describe('Daily Cleanup Workflow E2E', () => {
  let client: ActivepiecesClient;
  let manager: WorkflowManager;
  let executor: WorkflowExecutor;
  let workflowId: string;

  before(async () => {
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
      workflowId = await manager.registerWorkflow(dailyCleanupWorkflow);
      console.log(`Daily cleanup workflow registered: ${workflowId}`);
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

  it('should trigger manual cleanup', async () => {
    if (!workflowId) {
      console.log('Workflow not registered, skipping test');
      return;
    }

    try {
      const execution = await executor.executeWorkflow(workflowId, {});
      
      assert.ok(execution.executionId);
      assert.strictEqual(execution.workflowId, workflowId);
      
      console.log(`Cleanup execution started: ${execution.executionId}`);
      console.log(`Status: ${execution.status}`);
      
      assert.ok(['running', 'completed', 'failed'].includes(execution.status));
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.log('Activepieces not available during execution');
        return;
      }
      throw error;
    }
  });

  it('should verify workflow is enabled for schedule', async () => {
    if (!workflowId) {
      console.log('Workflow not registered, skipping test');
      return;
    }

    try {
      const workflows = await client.listWorkflows();
      const workflow = workflows.find(w => w.workflowId === workflowId);
      
      assert.ok(workflow);
      assert.strictEqual(workflow.enabled, true);
      console.log('Workflow is enabled for scheduled execution');
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.log('Activepieces not available');
        return;
      }
      throw error;
    }
  });
});
