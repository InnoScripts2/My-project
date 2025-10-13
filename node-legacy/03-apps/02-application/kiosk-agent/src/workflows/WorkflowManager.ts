/**
 * Workflow Manager
 * Manages workflow registration and lifecycle
 */

import { ActivepiecesClient } from './ActivepiecesClient.js';
import type { WorkflowDefinition } from './types.js';

export class WorkflowManager {
  private activepiecesClient: ActivepiecesClient;
  private workflowRegistry: Map<string, string> = new Map();

  constructor(activepiecesClient: ActivepiecesClient) {
    this.activepiecesClient = activepiecesClient;
  }

  /**
   * Register a new workflow
   */
  async registerWorkflow(workflow: WorkflowDefinition): Promise<string> {
    const response = await this.activepiecesClient.createWorkflow(workflow);

    this.workflowRegistry.set(workflow.name, response.workflowId);

    return response.workflowId;
  }

  /**
   * Update an existing workflow
   */
  async updateWorkflow(workflowId: string, workflow: WorkflowDefinition): Promise<void> {
    await this.activepiecesClient.updateWorkflow(workflowId, workflow);
    
    this.workflowRegistry.set(workflow.name, workflowId);
  }

  /**
   * Remove a workflow
   */
  async removeWorkflow(workflowId: string): Promise<void> {
    await this.activepiecesClient.deleteWorkflow(workflowId);

    for (const [name, id] of this.workflowRegistry.entries()) {
      if (id === workflowId) {
        this.workflowRegistry.delete(name);
        break;
      }
    }
  }

  /**
   * Get all registered workflows
   */
  async getWorkflows(): Promise<WorkflowDefinition[]> {
    const workflows = await this.activepiecesClient.listWorkflows();
    
    return workflows.map(w => ({
      name: w.name,
      description: '',
      trigger: { type: 'webhook', config: {} } as any,
      steps: [],
      enabled: w.enabled,
    }));
  }

  /**
   * Enable a workflow
   */
  async enableWorkflow(workflowId: string): Promise<void> {
    const workflows = await this.activepiecesClient.listWorkflows();
    const workflow = workflows.find(w => w.workflowId === workflowId);
    
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const definition: WorkflowDefinition = {
      name: workflow.name,
      description: '',
      trigger: { type: 'webhook', config: {} } as any,
      steps: [],
      enabled: true,
    };

    await this.activepiecesClient.updateWorkflow(workflowId, definition);
  }

  /**
   * Disable a workflow
   */
  async disableWorkflow(workflowId: string): Promise<void> {
    const workflows = await this.activepiecesClient.listWorkflows();
    const workflow = workflows.find(w => w.workflowId === workflowId);
    
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const definition: WorkflowDefinition = {
      name: workflow.name,
      description: '',
      trigger: { type: 'webhook', config: {} } as any,
      steps: [],
      enabled: false,
    };

    await this.activepiecesClient.updateWorkflow(workflowId, definition);
  }

  /**
   * Get workflow ID by name
   */
  getWorkflowId(name: string): string | undefined {
    return this.workflowRegistry.get(name);
  }

  /**
   * Get all registered workflow names
   */
  getRegisteredNames(): string[] {
    return Array.from(this.workflowRegistry.keys());
  }
}
