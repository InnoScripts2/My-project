/**
 * Integration tests for workflow triggers
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { EventEmitter } from 'events';
import { ActivepiecesClient } from '../../ActivepiecesClient.js';
import { WorkflowManager } from '../../WorkflowManager.js';
import { WorkflowExecutor } from '../../WorkflowExecutor.js';
import { WorkflowTriggerHandler } from '../../WorkflowTriggerHandler.js';
import type { WorkflowDefinition } from '../../types.js';

describe('Workflow Triggers Integration', () => {
  let app: express.Express;
  let client: ActivepiecesClient;
  let manager: WorkflowManager;
  let executor: WorkflowExecutor;
  let triggerHandler: WorkflowTriggerHandler;
  let eventEmitter: EventEmitter;

  before(() => {
    app = express();
    app.use(express.json());
    
    client = new ActivepiecesClient();
    client.initClient('http://localhost:3000', 'test-key');
    
    manager = new WorkflowManager(client);
    executor = new WorkflowExecutor(client);
    
    eventEmitter = new EventEmitter();
    triggerHandler = new WorkflowTriggerHandler(app, executor, eventEmitter);
  });

  it('should register webhook trigger', () => {
    const workflowId = 'test-workflow-001';
    const webhookPath = '/webhooks/test';

    assert.doesNotThrow(() => {
      triggerHandler.registerWebhookTrigger(workflowId, webhookPath);
    });
  });

  it('should register schedule trigger', () => {
    const workflowId = 'test-workflow-002';
    const cronExpression = '0 0 * * *';

    assert.doesNotThrow(() => {
      triggerHandler.registerScheduleTrigger(workflowId, cronExpression);
    });

    // Cleanup
    triggerHandler.unregisterScheduleTrigger(workflowId);
  });

  it('should register event trigger', () => {
    const workflowId = 'test-workflow-003';
    const eventName = 'test_event';

    assert.doesNotThrow(() => {
      triggerHandler.registerEventTrigger(workflowId, eventName);
    });
  });

  it('should emit event and trigger workflow', (t, done) => {
    const workflowId = 'test-workflow-004';
    const eventName = 'test_event_execution';

    // Mock executor
    const mockExecutor = {
      executeWorkflow: async (id: string, payload: any) => {
        assert.strictEqual(id, workflowId);
        assert.deepStrictEqual(payload, { test: 'data' });
        done();
        return {
          executionId: 'ex-001',
          workflowId: id,
          status: 'completed' as const,
          startedAt: new Date().toISOString(),
          steps: [],
        };
      },
      getExecutionStatus: async () => ({
        executionId: 'ex-001',
        workflowId,
        status: 'completed' as const,
        startedAt: new Date().toISOString(),
        steps: [],
      }),
      cancelExecution: async () => {},
    };

    const testTriggerHandler = new WorkflowTriggerHandler(
      app,
      mockExecutor as any,
      eventEmitter
    );

    testTriggerHandler.registerEventTrigger(workflowId, eventName);

    // Emit event
    eventEmitter.emit(eventName, { test: 'data' });
  });
});
