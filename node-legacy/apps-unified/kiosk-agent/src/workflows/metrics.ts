/**
 * Workflow automation metrics
 * Prometheus metrics for workflow execution monitoring
 */

import { Counter, Histogram, Registry } from 'prom-client';

export function registerWorkflowMetrics(registry: Registry) {
  const workflowExecutionsTotal = new Counter({
    name: 'workflow_executions_total',
    help: 'Total number of workflow executions',
    labelNames: ['workflowId', 'status'],
    registers: [registry],
  });

  const workflowExecutionDuration = new Histogram({
    name: 'workflow_execution_duration_seconds',
    help: 'Duration of workflow executions',
    labelNames: ['workflowId'],
    buckets: [1, 5, 10, 30, 60, 120, 300],
    registers: [registry],
  });

  const workflowStepsExecutedTotal = new Counter({
    name: 'workflow_steps_executed_total',
    help: 'Total number of workflow steps executed',
    labelNames: ['workflowId', 'stepName', 'status'],
    registers: [registry],
  });

  const workflowTriggersTotal = new Counter({
    name: 'workflow_triggers_total',
    help: 'Total number of workflow trigger activations',
    labelNames: ['triggerType'],
    registers: [registry],
  });

  const workflowFailuresTotal = new Counter({
    name: 'workflow_failures_total',
    help: 'Total number of failed workflow executions',
    labelNames: ['workflowId', 'errorType'],
    registers: [registry],
  });

  return {
    workflowExecutionsTotal,
    workflowExecutionDuration,
    workflowStepsExecutedTotal,
    workflowTriggersTotal,
    workflowFailuresTotal,
  };
}

let metricsInstance: ReturnType<typeof registerWorkflowMetrics> | null = null;

export function getWorkflowMetrics(registry: Registry): ReturnType<typeof registerWorkflowMetrics> {
  if (!metricsInstance) {
    metricsInstance = registerWorkflowMetrics(registry);
  }
  return metricsInstance;
}
