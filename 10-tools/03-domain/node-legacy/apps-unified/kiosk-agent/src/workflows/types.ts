/**
 * Workflow automation types and interfaces
 */

export interface WorkflowDefinition {
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  enabled: boolean;
}

export interface WorkflowTrigger {
  type: 'webhook' | 'schedule' | 'event';
  config: WebhookTriggerConfig | ScheduleTriggerConfig | EventTriggerConfig;
}

export interface WebhookTriggerConfig {
  webhookPath: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
}

export interface ScheduleTriggerConfig {
  cronExpression: string;
}

export interface EventTriggerConfig {
  eventName: string;
  condition?: string;
}

export interface WorkflowStep {
  name: string;
  type: 'http' | 'email' | 'sms' | 'script' | 'condition' | 'delay' | 'loop' | 'slack';
  config: Record<string, any>;
  nextStep?: string;
  onTrue?: string;
  onFalse?: string;
}

export interface WorkflowResponse {
  workflowId: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionResponse {
  executionId: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  steps: ExecutionStep[];
  error?: string;
}

export interface ExecutionStep {
  stepName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: Record<string, any>;
  error?: string;
}
