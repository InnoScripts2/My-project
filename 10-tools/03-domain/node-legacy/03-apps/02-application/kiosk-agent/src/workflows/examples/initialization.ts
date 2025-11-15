/**
 * Workflow system initialization example
 * Shows how to integrate workflows into kiosk-agent
 */

import express from 'express';
import { EventEmitter } from 'events';
import { Registry } from 'prom-client';
import {
  ActivepiecesClient,
  WorkflowManager,
  WorkflowExecutor,
  WorkflowTriggerHandler,
  getWorkflowMetrics,
  builtInWorkflows,
} from '../index.js';
import { createWorkflowRoutes } from '../../api/routes/workflows.routes.js';

/**
 * Initialize workflow automation system
 */
export async function initializeWorkflows(
  app: express.Express,
  eventEmitter: EventEmitter,
  registry: Registry
): Promise<{
  client: ActivepiecesClient;
  manager: WorkflowManager;
  executor: WorkflowExecutor;
  triggerHandler: WorkflowTriggerHandler;
}> {
  // Check if workflows are enabled
  if (process.env.WORKFLOWS_ENABLED !== 'true') {
    console.log('Workflows disabled. Set WORKFLOWS_ENABLED=true to enable.');
    throw new Error('Workflows not enabled');
  }

  // Initialize Activepieces client
  const client = new ActivepiecesClient();
  const apiUrl = process.env.ACTIVEPIECES_API_URL || 'http://localhost:3000';
  const apiKey = process.env.ACTIVEPIECES_API_KEY || '';

  if (!apiKey) {
    throw new Error('ACTIVEPIECES_API_KEY not set in environment');
  }

  client.initClient(apiUrl, apiKey);
  console.log(`Activepieces client initialized: ${apiUrl}`);

  // Initialize workflow manager
  const manager = new WorkflowManager(client);

  // Initialize metrics
  const workflowMetrics = getWorkflowMetrics(registry);
  
  // Create metrics service adapter
  const metricsService = {
    incrementCounter: (name: string, labels: Record<string, any>) => {
      if (name === 'workflow_executions_total') {
        workflowMetrics.workflowExecutionsTotal.labels(labels.workflowId, 'started').inc();
      } else if (name === 'workflow_failures_total') {
        workflowMetrics.workflowFailuresTotal.labels(labels.workflowId, 'unknown').inc();
      }
    },
  };

  // Initialize workflow executor
  const executor = new WorkflowExecutor(client, metricsService);

  // Initialize trigger handler
  const triggerHandler = new WorkflowTriggerHandler(app, executor, eventEmitter);

  // Register REST API routes
  const workflowRoutes = createWorkflowRoutes(manager, executor);
  app.use(workflowRoutes);
  console.log('Workflow REST API routes registered');

  // Register built-in workflows (optional)
  if (process.env.REGISTER_BUILTIN_WORKFLOWS === 'true') {
    console.log('Registering built-in workflows...');
    
    for (const workflow of builtInWorkflows) {
      try {
        const workflowId = await manager.registerWorkflow(workflow);
        console.log(`Registered workflow: ${workflow.name} (${workflowId})`);

        // Register triggers
        if (workflow.trigger.type === 'webhook') {
          const config = workflow.trigger.config as any;
          triggerHandler.registerWebhookTrigger(workflowId, config.webhookPath);
          console.log(`  Webhook trigger: ${config.webhookPath}`);
        } else if (workflow.trigger.type === 'schedule') {
          const config = workflow.trigger.config as any;
          triggerHandler.registerScheduleTrigger(workflowId, config.cronExpression);
          console.log(`  Schedule trigger: ${config.cronExpression}`);
        } else if (workflow.trigger.type === 'event') {
          const config = workflow.trigger.config as any;
          triggerHandler.registerEventTrigger(workflowId, config.eventName);
          console.log(`  Event trigger: ${config.eventName}`);
        }
      } catch (error: any) {
        console.error(`Failed to register workflow ${workflow.name}:`, error.message);
      }
    }
  }

  return { client, manager, executor, triggerHandler };
}

/**
 * Example: Trigger workflow on alert event
 */
export function setupAlertWorkflowIntegration(
  eventEmitter: EventEmitter,
  executor: WorkflowExecutor,
  manager: WorkflowManager
): void {
  eventEmitter.on('alert_triggered', async (alert: any) => {
    console.log('Alert triggered:', alert);

    // Find auto-restart workflow
    const workflowId = manager.getWorkflowId('auto_restart_on_critical_alert');
    if (!workflowId) {
      console.log('Auto-restart workflow not registered');
      return;
    }

    // Only trigger for critical alerts
    if (alert.severity === 'critical') {
      try {
        await executor.executeWorkflow(workflowId, alert);
        console.log('Auto-restart workflow triggered');
      } catch (error: any) {
        console.error('Failed to trigger workflow:', error.message);
      }
    }
  });
}
