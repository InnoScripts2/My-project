/**
 * Workflow automation module exports
 */

export { ActivepiecesClient } from './ActivepiecesClient.js';
export { WorkflowManager } from './WorkflowManager.js';
export { WorkflowExecutor } from './WorkflowExecutor.js';
export { WorkflowTriggerHandler } from './WorkflowTriggerHandler.js';
export { registerWorkflowMetrics, getWorkflowMetrics } from './metrics.js';
export { builtInWorkflows, autoRestartWorkflow, dailyCleanupWorkflow, syncOrchestrationWorkflow } from './examples/built-in-workflows.js';

export type {
  WorkflowDefinition,
  WorkflowTrigger,
  WorkflowStep,
  WorkflowResponse,
  ExecutionResponse,
  ExecutionStep,
  WebhookTriggerConfig,
  ScheduleTriggerConfig,
  EventTriggerConfig,
} from './types.js';
