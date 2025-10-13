/**
 * Activepieces API Client
 * Provides programmatic interface to Activepieces workflow platform
 */
import axios from 'axios';
export class ActivepiecesClient {
    constructor() {
        this.apiUrl = '';
        this.apiKey = '';
        this.client = null;
    }
    /**
     * Initialize client with API URL and key
     */
    initClient(apiUrl, apiKey) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.client = axios.create({
            baseURL: apiUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 10000,
        });
    }
    /**
     * Create a new workflow
     */
    async createWorkflow(workflow) {
        if (!this.client) {
            throw new Error('Client not initialized. Call initClient first.');
        }
        const response = await this.client.post('/api/workflows', workflow);
        return response.data;
    }
    /**
     * Update an existing workflow
     */
    async updateWorkflow(workflowId, workflow) {
        if (!this.client) {
            throw new Error('Client not initialized. Call initClient first.');
        }
        const response = await this.client.put(`/api/workflows/${workflowId}`, workflow);
        return response.data;
    }
    /**
     * Delete a workflow
     */
    async deleteWorkflow(workflowId) {
        if (!this.client) {
            throw new Error('Client not initialized. Call initClient first.');
        }
        await this.client.delete(`/api/workflows/${workflowId}`);
    }
    /**
     * List all workflows
     */
    async listWorkflows() {
        if (!this.client) {
            throw new Error('Client not initialized. Call initClient first.');
        }
        const response = await this.client.get('/api/workflows');
        return response.data;
    }
    /**
     * Trigger a workflow with payload
     */
    async triggerWorkflow(workflowId, payload) {
        if (!this.client) {
            throw new Error('Client not initialized. Call initClient first.');
        }
        const response = await this.client.post(`/api/workflows/${workflowId}/trigger`, payload);
        return response.data;
    }
    /**
     * Get execution details
     */
    async getExecution(executionId) {
        if (!this.client) {
            throw new Error('Client not initialized. Call initClient first.');
        }
        const response = await this.client.get(`/api/executions/${executionId}`);
        return response.data;
    }
    /**
     * List executions for a workflow
     */
    async listExecutions(workflowId) {
        if (!this.client) {
            throw new Error('Client not initialized. Call initClient first.');
        }
        const response = await this.client.get(`/api/workflows/${workflowId}/executions`);
        return response.data;
    }
}
