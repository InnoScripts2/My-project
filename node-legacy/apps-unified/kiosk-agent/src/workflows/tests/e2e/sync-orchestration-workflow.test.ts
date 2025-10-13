/**
 * E2E test for sync orchestration workflow
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { ActivepiecesClient } from '../../ActivepiecesClient.js';
import { WorkflowManager } from '../../WorkflowManager.js';
import { WorkflowExecutor } from '../../WorkflowExecutor.js';
import { syncOrchestrationWorkflow } from '../../examples/built-in-workflows.js';

describe('Sync Orchestration Workflow E2E', () => {
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
      workflowId = await manager.registerWorkflow(syncOrchestrationWorkflow);
      console.log(`Sync orchestration workflow registered: ${workflowId}`);
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

  it('should trigger manual sync orchestration', async () => {
    if (!workflowId) {
      console.log('Workflow not registered, skipping test');
      return;
    }

    try {
      const execution = await executor.executeWorkflow(workflowId, {});
      
      assert.ok(execution.executionId);
      assert.strictEqual(execution.workflowId, workflowId);
      
      console.log(`Sync execution started: ${execution.executionId}`);
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

  it('should list execution history', async () => {
    if (!workflowId) {
      console.log('Workflow not registered, skipping test');
      return;
    }

    try {
      const executions = await client.listExecutions(workflowId);
      assert.ok(Array.isArray(executions));
      
      console.log(`Found ${executions.length} execution(s) for sync workflow`);
      
      if (executions.length > 0) {
        const latest = executions[0];
        assert.ok(latest.executionId);
        assert.strictEqual(latest.workflowId, workflowId);
        
        // Check for steps in execution
        if (latest.steps && latest.steps.length > 0) {
          console.log(`Latest execution has ${latest.steps.length} step(s)`);
        }
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
