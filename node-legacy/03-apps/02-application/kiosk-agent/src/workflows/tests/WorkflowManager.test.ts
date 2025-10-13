/**
 * Unit tests for WorkflowManager
 */

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { WorkflowManager } from '../WorkflowManager.js';
import { ActivepiecesClient } from '../ActivepiecesClient.js';
import type { WorkflowDefinition, WorkflowResponse } from '../types.js';

describe('WorkflowManager', () => {
  let manager: WorkflowManager;
  let mockClient: ActivepiecesClient;

  beforeEach(() => {
    mockClient = new ActivepiecesClient();
    mockClient.initClient('http://localhost:3000', 'test-key');
    manager = new WorkflowManager(mockClient);
  });

  it('should register workflow and store in registry', async () => {
    const mockResponse: WorkflowResponse = {
      workflowId: 'wf-001',
      name: 'test_workflow',
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockClient.createWorkflow = mock.fn(async () => mockResponse);

    const workflow: WorkflowDefinition = {
      name: 'test_workflow',
      description: 'Test',
      trigger: { type: 'webhook', config: { webhookPath: '/test' } },
      steps: [],
      enabled: true,
    };

    const workflowId = await manager.registerWorkflow(workflow);

    assert.strictEqual(workflowId, 'wf-001');
    assert.strictEqual(manager.getWorkflowId('test_workflow'), 'wf-001');
  });

  it('should return registered workflow names', async () => {
    const mockResponse: WorkflowResponse = {
      workflowId: 'wf-001',
      name: 'test_workflow',
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockClient.createWorkflow = mock.fn(async () => mockResponse);

    const workflow: WorkflowDefinition = {
      name: 'test_workflow',
      description: 'Test',
      trigger: { type: 'webhook', config: { webhookPath: '/test' } },
      steps: [],
      enabled: true,
    };

    await manager.registerWorkflow(workflow);

    const names = manager.getRegisteredNames();
    assert.strictEqual(names.length, 1);
    assert.strictEqual(names[0], 'test_workflow');
  });

  it('should remove workflow from registry', async () => {
    const mockResponse: WorkflowResponse = {
      workflowId: 'wf-001',
      name: 'test_workflow',
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockClient.createWorkflow = mock.fn(async () => mockResponse);
    mockClient.deleteWorkflow = mock.fn(async () => {});

    const workflow: WorkflowDefinition = {
      name: 'test_workflow',
      description: 'Test',
      trigger: { type: 'webhook', config: { webhookPath: '/test' } },
      steps: [],
      enabled: true,
    };

    const workflowId = await manager.registerWorkflow(workflow);
    await manager.removeWorkflow(workflowId);

    assert.strictEqual(manager.getWorkflowId('test_workflow'), undefined);
  });
});
