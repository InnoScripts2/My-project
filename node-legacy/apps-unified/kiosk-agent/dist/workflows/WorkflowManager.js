/**
 * Workflow Manager
 * Manages workflow registration and lifecycle
 */
export class WorkflowManager {
    constructor(activepiecesClient) {
        this.workflowRegistry = new Map();
        this.activepiecesClient = activepiecesClient;
    }
    /**
     * Register a new workflow
     */
    async registerWorkflow(workflow) {
        const response = await this.activepiecesClient.createWorkflow(workflow);
        this.workflowRegistry.set(workflow.name, response.workflowId);
        return response.workflowId;
    }
    /**
     * Update an existing workflow
     */
    async updateWorkflow(workflowId, workflow) {
        await this.activepiecesClient.updateWorkflow(workflowId, workflow);
        this.workflowRegistry.set(workflow.name, workflowId);
    }
    /**
     * Remove a workflow
     */
    async removeWorkflow(workflowId) {
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
    async getWorkflows() {
        const workflows = await this.activepiecesClient.listWorkflows();
        return workflows.map(w => ({
            name: w.name,
            description: '',
            trigger: { type: 'webhook', config: {} },
            steps: [],
            enabled: w.enabled,
        }));
    }
    /**
     * Enable a workflow
     */
    async enableWorkflow(workflowId) {
        const workflows = await this.activepiecesClient.listWorkflows();
        const workflow = workflows.find(w => w.workflowId === workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }
        const definition = {
            name: workflow.name,
            description: '',
            trigger: { type: 'webhook', config: {} },
            steps: [],
            enabled: true,
        };
        await this.activepiecesClient.updateWorkflow(workflowId, definition);
    }
    /**
     * Disable a workflow
     */
    async disableWorkflow(workflowId) {
        const workflows = await this.activepiecesClient.listWorkflows();
        const workflow = workflows.find(w => w.workflowId === workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }
        const definition = {
            name: workflow.name,
            description: '',
            trigger: { type: 'webhook', config: {} },
            steps: [],
            enabled: false,
        };
        await this.activepiecesClient.updateWorkflow(workflowId, definition);
    }
    /**
     * Get workflow ID by name
     */
    getWorkflowId(name) {
        return this.workflowRegistry.get(name);
    }
    /**
     * Get all registered workflow names
     */
    getRegisteredNames() {
        return Array.from(this.workflowRegistry.keys());
    }
}
