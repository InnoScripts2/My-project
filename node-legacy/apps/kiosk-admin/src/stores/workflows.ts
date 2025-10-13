/**
 * Workflows Store
 * Pinia store for workflow automation management
 */

import { defineStore } from 'pinia';
import axios from 'axios';

interface WorkflowDefinition {
  name: string;
  description: string;
  trigger: any;
  steps: any[];
  enabled: boolean;
}

interface WorkflowResponse {
  workflowId: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ExecutionResponse {
  executionId: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  steps: any[];
  error?: string;
}

export const useWorkflowsStore = defineStore('workflows', {
  state: () => ({
    workflows: [] as WorkflowResponse[],
    executions: [] as ExecutionResponse[],
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchWorkflows() {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await axios.get('/api/workflows');
        this.workflows = response.data;
      } catch (error: any) {
        this.error = error.message || 'Failed to fetch workflows';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async createWorkflow(workflow: WorkflowDefinition) {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await axios.post('/api/workflows', workflow);
        this.workflows.push(response.data);
        return response.data;
      } catch (error: any) {
        this.error = error.message || 'Failed to create workflow';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async updateWorkflow(workflowId: string, workflow: WorkflowDefinition) {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await axios.put(`/api/workflows/${workflowId}`, workflow);
        const index = this.workflows.findIndex(w => w.workflowId === workflowId);
        if (index !== -1) {
          this.workflows[index] = response.data;
        }
        return response.data;
      } catch (error: any) {
        this.error = error.message || 'Failed to update workflow';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async deleteWorkflow(workflowId: string) {
      this.loading = true;
      this.error = null;
      
      try {
        await axios.delete(`/api/workflows/${workflowId}`);
        this.workflows = this.workflows.filter(w => w.workflowId !== workflowId);
      } catch (error: any) {
        this.error = error.message || 'Failed to delete workflow';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async triggerWorkflow(workflowId: string, payload: Record<string, any>) {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await axios.post(`/api/workflows/${workflowId}/trigger`, { payload });
        return response.data;
      } catch (error: any) {
        this.error = error.message || 'Failed to trigger workflow';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchExecutions(workflowId: string) {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await axios.get(`/api/workflows/${workflowId}/executions`);
        this.executions = response.data;
      } catch (error: any) {
        this.error = error.message || 'Failed to fetch executions';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async fetchExecution(executionId: string) {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await axios.get(`/api/executions/${executionId}`);
        return response.data;
      } catch (error: any) {
        this.error = error.message || 'Failed to fetch execution';
        throw error;
      } finally {
        this.loading = false;
      }
    },
  },
});
