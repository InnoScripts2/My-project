/**
 * Workflow Executor
 * Executes workflows and monitors their completion
 */
export class WorkflowExecutor {
    constructor(activepiecesClient, metricsService) {
        this.activepiecesClient = activepiecesClient;
        this.metricsService = metricsService;
    }
    /**
     * Execute a workflow with payload
     */
    async executeWorkflow(workflowId, payload) {
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
    async getExecutionStatus(executionId) {
        return await this.activepiecesClient.getExecution(executionId);
    }
    /**
     * Cancel an execution (not supported by Activepieces API yet)
     */
    async cancelExecution(executionId) {
        throw new Error('Cancel execution not supported');
    }
    /**
     * Poll execution status until completion or timeout
     */
    async pollExecution(executionId, timeoutMs) {
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
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
