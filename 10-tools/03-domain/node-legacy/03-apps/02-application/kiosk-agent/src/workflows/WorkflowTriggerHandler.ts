/**
 * Workflow Trigger Handler
 * Manages workflow triggers (webhook, schedule, event)
 */

import type { Express, Request, Response } from 'express';
import { WorkflowExecutor } from './WorkflowExecutor.js';
import cron from 'node-cron';
import { EventEmitter } from 'events';

export class WorkflowTriggerHandler {
  private expressApp: Express;
  private workflowExecutor: WorkflowExecutor;
  private eventEmitter: EventEmitter;
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();

  constructor(expressApp: Express, workflowExecutor: WorkflowExecutor, eventEmitter: EventEmitter) {
    this.expressApp = expressApp;
    this.workflowExecutor = workflowExecutor;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Register webhook trigger
   */
  registerWebhookTrigger(workflowId: string, webhookPath: string): void {
    this.expressApp.post(webhookPath, async (req: Request, res: Response) => {
      try {
        await this.workflowExecutor.executeWorkflow(workflowId, req.body);
        res.status(200).json({ message: 'Workflow triggered' });
      } catch (error) {
        console.error('Webhook trigger error:', error);
        res.status(500).json({ error: 'Failed to trigger workflow' });
      }
    });
  }

  /**
   * Register schedule trigger
   */
  registerScheduleTrigger(workflowId: string, cronExpression: string): void {
    const task = cron.schedule(cronExpression, async () => {
      try {
        await this.workflowExecutor.executeWorkflow(workflowId, {});
      } catch (error) {
        console.error('Schedule trigger error:', error);
      }
    });

    this.cronJobs.set(workflowId, task);
  }

  /**
   * Register event trigger
   */
  registerEventTrigger(workflowId: string, eventName: string): void {
    this.eventEmitter.on(eventName, async (payload: any) => {
      try {
        await this.workflowExecutor.executeWorkflow(workflowId, payload);
      } catch (error) {
        console.error('Event trigger error:', error);
      }
    });
  }

  /**
   * Unregister schedule trigger
   */
  unregisterScheduleTrigger(workflowId: string): void {
    const task = this.cronJobs.get(workflowId);
    if (task) {
      task.stop();
      this.cronJobs.delete(workflowId);
    }
  }

  /**
   * Handle webhook request manually
   */
  async handleWebhookRequest(req: Request, res: Response): Promise<void> {
    res.status(404).json({ error: 'Webhook not found' });
  }
}
