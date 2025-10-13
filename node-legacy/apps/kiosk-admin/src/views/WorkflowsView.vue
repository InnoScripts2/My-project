<template>
  <div class="workflows-view">
    <div class="workflows-header">
      <h2>Workflow Automation</h2>
      <a-button type="primary" @click="showCreateModal = true">
        Create Workflow
      </a-button>
    </div>

    <a-card>
      <a-table
        :dataSource="workflowsStore.workflows"
        :columns="columns"
        :loading="workflowsStore.loading"
        rowKey="workflowId"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'enabled'">
            <a-badge
              :status="record.enabled ? 'success' : 'default'"
              :text="record.enabled ? 'Enabled' : 'Disabled'"
            />
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button size="small" @click="onViewExecutions(record.workflowId)">
                Executions
              </a-button>
              <a-button size="small" @click="onTriggerWorkflow(record.workflowId)">
                Trigger
              </a-button>
              <a-button size="small" @click="onEditWorkflow(record)">
                Edit
              </a-button>
              <a-popconfirm
                title="Are you sure you want to delete this workflow?"
                @confirm="onDeleteWorkflow(record.workflowId)"
              >
                <a-button size="small" danger>Delete</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="showCreateModal"
      title="Create Workflow"
      width="800px"
      @ok="onSubmitCreate"
      @cancel="onCancelCreate"
    >
      <a-form :model="formData" layout="vertical">
        <a-form-item label="Name" required>
          <a-input v-model:value="formData.name" placeholder="workflow_name" />
        </a-form-item>
        <a-form-item label="Description">
          <a-textarea v-model:value="formData.description" placeholder="Workflow description" />
        </a-form-item>
        <a-form-item label="Enabled">
          <a-switch v-model:checked="formData.enabled" />
        </a-form-item>
        <a-alert
          message="Advanced Configuration"
          description="Use REST API or YAML files for detailed trigger and step configuration"
          type="info"
          show-icon
        />
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="showExecutionsModal"
      title="Workflow Executions"
      width="1000px"
      :footer="null"
    >
      <a-table
        :dataSource="workflowsStore.executions"
        :columns="executionColumns"
        :loading="workflowsStore.loading"
        rowKey="executionId"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-badge
              :status="getExecutionStatusBadge(record.status)"
              :text="record.status"
            />
          </template>
          <template v-else-if="column.key === 'duration'">
            {{ calculateDuration(record) }}
          </template>
        </template>
      </a-table>
    </a-modal>

    <a-modal
      v-model:open="showTriggerModal"
      title="Trigger Workflow"
      @ok="onSubmitTrigger"
      @cancel="onCancelTrigger"
    >
      <a-form layout="vertical">
        <a-form-item label="Payload (JSON)">
          <a-textarea
            v-model:value="triggerPayload"
            placeholder='{"key": "value"}'
            :rows="8"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useWorkflowsStore } from '@/stores/workflows';
import { message } from 'ant-design-vue';

const workflowsStore = useWorkflowsStore();

const showCreateModal = ref(false);
const showExecutionsModal = ref(false);
const showTriggerModal = ref(false);
const selectedWorkflowId = ref<string | null>(null);
const triggerPayload = ref('{}');

const formData = ref({
  name: '',
  description: '',
  enabled: true,
});

const columns = [
  {
    title: 'Name',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: 'Enabled',
    dataIndex: 'enabled',
    key: 'enabled',
  },
  {
    title: 'Created',
    dataIndex: 'createdAt',
    key: 'createdAt',
  },
  {
    title: 'Updated',
    dataIndex: 'updatedAt',
    key: 'updatedAt',
  },
  {
    title: 'Actions',
    key: 'actions',
  },
];

const executionColumns = [
  {
    title: 'Execution ID',
    dataIndex: 'executionId',
    key: 'executionId',
  },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
  },
  {
    title: 'Started',
    dataIndex: 'startedAt',
    key: 'startedAt',
  },
  {
    title: 'Duration',
    key: 'duration',
  },
];

onMounted(async () => {
  await workflowsStore.fetchWorkflows();
});

async function onSubmitCreate() {
  try {
    await workflowsStore.createWorkflow({
      ...formData.value,
      trigger: { type: 'webhook', config: { webhookPath: `/webhooks/${formData.value.name}` } },
      steps: [],
    });
    message.success('Workflow created successfully');
    showCreateModal.value = false;
    formData.value = { name: '', description: '', enabled: true };
  } catch (error) {
    message.error('Failed to create workflow');
  }
}

function onCancelCreate() {
  showCreateModal.value = false;
  formData.value = { name: '', description: '', enabled: true };
}

async function onViewExecutions(workflowId: string) {
  selectedWorkflowId.value = workflowId;
  await workflowsStore.fetchExecutions(workflowId);
  showExecutionsModal.value = true;
}

function onTriggerWorkflow(workflowId: string) {
  selectedWorkflowId.value = workflowId;
  triggerPayload.value = '{}';
  showTriggerModal.value = true;
}

async function onSubmitTrigger() {
  if (!selectedWorkflowId.value) return;

  try {
    const payload = JSON.parse(triggerPayload.value);
    await workflowsStore.triggerWorkflow(selectedWorkflowId.value, payload);
    message.success('Workflow triggered successfully');
    showTriggerModal.value = false;
  } catch (error) {
    message.error('Failed to trigger workflow');
  }
}

function onCancelTrigger() {
  showTriggerModal.value = false;
  triggerPayload.value = '{}';
}

function onEditWorkflow(workflow: any) {
  message.info('Edit workflow functionality - use REST API for advanced configuration');
}

async function onDeleteWorkflow(workflowId: string) {
  try {
    await workflowsStore.deleteWorkflow(workflowId);
    message.success('Workflow deleted successfully');
  } catch (error) {
    message.error('Failed to delete workflow');
  }
}

function getExecutionStatusBadge(status: string) {
  const statusMap: Record<string, string> = {
    running: 'processing',
    completed: 'success',
    failed: 'error',
  };
  return statusMap[status] || 'default';
}

function calculateDuration(record: any) {
  if (!record.completedAt) return 'Running...';
  
  const start = new Date(record.startedAt).getTime();
  const end = new Date(record.completedAt).getTime();
  const duration = (end - start) / 1000;
  
  return `${duration.toFixed(2)}s`;
}
</script>

<style scoped>
.workflows-view {
  padding: 20px;
}

.workflows-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.workflows-header h2 {
  margin: 0;
}
</style>
