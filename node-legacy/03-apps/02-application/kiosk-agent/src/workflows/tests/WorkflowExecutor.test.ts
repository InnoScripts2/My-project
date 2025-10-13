/**
 * Unit tests for WorkflowExecutor
 */

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { WorkflowExecutor } from '../WorkflowExecutor.js';
import { ActivepiecesClient } from '../ActivepiecesClient.js';
import type { ExecutionResponse } from '../types.js';

describe('WorkflowExecutor', () => {
  let executor: WorkflowExecutor;
  let mockClient: ActivepiecesClient;
  let mockMetrics: any;

  beforeEach(() => {
    mockClient = new ActivepiecesClient();
    mockClient.initClient('http://localhost:3000', 'test-key');
    
    mockMetrics = {
      incrementCounter: mock.fn(() => {}),
    };
    
    executor = new WorkflowExecutor(mockClient, mockMetrics);
  });

  it('should execute workflow and increment metrics', async () => {
    const mockExecution: ExecutionResponse = {
      executionId: 'ex-001',
      workflowId: 'wf-001',
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      steps: [],
    };

    mockClient.triggerWorkflow = mock.fn(async () => mockExecution);
    mockClient.getExecution = mock.fn(async () => mockExecution);

    const result = await executor.executeWorkflow('wf-001', {});

    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(mockMetrics.incrementCounter.mock.calls.length, 1);
  });

  it('should increment failure metric on failed execution', async () => {
    const mockExecution: ExecutionResponse = {
      executionId: 'ex-001',
      workflowId: 'wf-001',
      status: 'failed',
      startedAt: new Date().toISOString(),
      steps: [],
      error: 'Test error',
    };

    mockClient.triggerWorkflow = mock.fn(async () => mockExecution);
    mockClient.getExecution = mock.fn(async () => mockExecution);

    const result = await executor.executeWorkflow('wf-001', {});

    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(mockMetrics.incrementCounter.mock.calls.length, 2);
  });

  it('should get execution status', async () => {
    const mockExecution: ExecutionResponse = {
      executionId: 'ex-001',
      workflowId: 'wf-001',
      status: 'running',
      startedAt: new Date().toISOString(),
      steps: [],
    };

    mockClient.getExecution = mock.fn(async () => mockExecution);

    const result = await executor.getExecutionStatus('ex-001');

    assert.strictEqual(result.status, 'running');
  });

  it('should throw error on cancel execution', async () => {
    await assert.rejects(
      async () => await executor.cancelExecution('ex-001'),
      /Cancel execution not supported/
    );
  });
});
