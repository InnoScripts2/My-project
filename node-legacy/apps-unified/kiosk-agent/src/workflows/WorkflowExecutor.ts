/**
 * Workflow Executor
 * Executes workflows and monitors their completion
 */

import { ActivepiecesClient } from './ActivepiecesClient.js';
import type { ExecutionResponse } from './types.js';

interface MetricsService {
  incrementCounter(name: string, labels: Record<string, any>): void;
}

export class WorkflowExecutor {
  private activepiecesClient: ActivepiecesClient;
  private metricsService?: MetricsService;

  constructor(activepiecesClient: ActivepiecesClient, metricsService?: MetricsService) {
    this.activepiecesClient = activepiecesClient;
    this.metricsService = metricsService;
  }

  /**
   * Execute a workflow with payload
   */
  async executeWorkflow(workflowId: string, payload: Record<string, any>): Promise<ExecutionResponse> {
    const execution = await this.activepiecesClient.triggerWorkflow(workflowId, payload);

    if (this.metricsService) {
      this.metricsService.incrementCounter('workflow_executions_total', { workflowId });
    }

    const finalStatus = await this.pollExecution(execution.executionId, 60000);

    if (finalStatus.status === 'failed' && this.metricsService) {
      this.metricsService.incrementCounter('workflow_failures_total', { workflowId });
    }

    return finalStatus;
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId: string): Promise<ExecutionResponse> {
    return await this.activepiecesClient.getExecution(executionId);
  }

  /**
   * Cancel an execution (not supported by Activepieces API yet)
   */
  async cancelExecution(executionId: string): Promise<void> {
    throw new Error('Cancel execution not supported');
  }

  /**
   * Poll execution status until completion or timeout
   */
  private async pollExecution(executionId: string, timeoutMs: number): Promise<ExecutionResponse> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      const execution = await this.activepiecesClient.getExecution(executionId);

      if (execution.status === 'completed' || execution.status === 'failed') {
        return execution;
      }

      await this.sleep(pollInterval);
    }

    throw new Error(`Execution ${executionId} timed out after ${timeoutMs}ms`);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
