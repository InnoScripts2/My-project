/**
 * Workflow automation REST API routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { WorkflowManager } from '../../workflows/WorkflowManager.js';
import { WorkflowExecutor } from '../../workflows/WorkflowExecutor.js';
import { ActivepiecesClient } from '../../workflows/ActivepiecesClient.js';
import type { WorkflowDefinition } from '../../workflows/types.js';

const workflowDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  trigger: z.object({
    type: z.enum(['webhook', 'schedule', 'event']),
    config: z.record(z.any()),
  }),
  steps: z.array(z.object({
    name: z.string(),
    type: z.string(),
    config: z.record(z.any()),
    nextStep: z.string().optional(),
    onTrue: z.string().optional(),
    onFalse: z.string().optional(),
  })),
  enabled: z.boolean(),
});

const triggerPayloadSchema = z.object({
  payload: z.record(z.any()).optional(),
});

export function createWorkflowRoutes(
  workflowManager: WorkflowManager,
  workflowExecutor: WorkflowExecutor
): Router {
  const router = Router();

  router.get('/api/workflows', async (_req: Request, res: Response) => {
    try {
      const workflows = await workflowManager.getWorkflows();
      res.json(workflows);
    } catch (error: any) {
      res.status(500).json({
        error: 'list_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.post('/api/workflows', async (req: Request, res: Response) => {
    const parsed = workflowDefinitionSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const workflowId = await workflowManager.registerWorkflow(parsed.data as WorkflowDefinition);
      
      res.status(201).json({
        workflowId,
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'create_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.put('/api/workflows/:id', async (req: Request, res: Response) => {
    const parsed = workflowDefinitionSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      await workflowManager.updateWorkflow(req.params.id, parsed.data as WorkflowDefinition);
      
      res.json({
        workflowId: req.params.id,
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        updatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'update_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.delete('/api/workflows/:id', async (req: Request, res: Response) => {
    try {
      await workflowManager.removeWorkflow(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({
        error: 'delete_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.post('/api/workflows/:id/trigger', async (req: Request, res: Response) => {
    const parsed = triggerPayloadSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const execution = await workflowExecutor.executeWorkflow(
        req.params.id,
        parsed.data.payload || {}
      );
      
      res.json(execution);
    } catch (error: any) {
      res.status(500).json({
        error: 'trigger_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.get('/api/workflows/:id/executions', async (req: Request, res: Response) => {
    try {
      const client = new ActivepiecesClient();
      client.initClient(
        process.env.ACTIVEPIECES_API_URL || 'http://localhost:3000',
        process.env.ACTIVEPIECES_API_KEY || ''
      );
      
      const executions = await client.listExecutions(req.params.id);
      res.json(executions);
    } catch (error: any) {
      res.status(500).json({
        error: 'list_executions_failed',
        message: error?.message || String(error),
      });
    }
  });

  router.get('/api/executions/:id', async (req: Request, res: Response) => {
    try {
      const execution = await workflowExecutor.getExecutionStatus(req.params.id);
      res.json(execution);
    } catch (error: any) {
      res.status(500).json({
        error: 'get_execution_failed',
        message: error?.message || String(error),
      });
    }
  });

  return router;
}
