<template>
  <div class="sessions-view">
    <a-card title="Sessions Management">
      <template #extra>
        <a-space>
          <a-range-picker v-model:value="dateRange" />
          <a-select v-model:value="typeFilter" placeholder="Filter by type" style="width: 150px" allow-clear>
            <a-select-option value="THICKNESS">Thickness</a-select-option>
            <a-select-option value="DIAGNOSTICS">Diagnostics</a-select-option>
          </a-select>
          <a-select v-model:value="statusFilter" placeholder="Filter by status" style="width: 150px" allow-clear>
            <a-select-option value="in-progress">In Progress</a-select-option>
            <a-select-option value="completed">Completed</a-select-option>
            <a-select-option value="incomplete">Incomplete</a-select-option>
            <a-select-option value="failed">Failed</a-select-option>
          </a-select>
          <a-button type="primary" @click="applyFilters">Apply</a-button>
        </a-space>
      </template>

      <a-table 
        :columns="columns" 
        :data-source="sessionsStore.filteredSessions" 
        :loading="sessionsStore.loading"
        row-key="sessionId"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'type'">
            <a-tag :color="record.type === 'THICKNESS' ? 'blue' : 'green'">{{ record.type }}</a-tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-badge :status="getStatusBadge(record.status)" :text="record.status" />
          </template>
          <template v-else-if="column.key === 'startedAt'">
            {{ formatDate(record.startedAt) }}
          </template>
          <template v-else-if="column.key === 'duration'">
            {{ formatDuration(record.duration) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button size="small" @click="handleViewDetails(record)">View Details</a-button>
              <a-button 
                v-if="record.status === 'in-progress'" 
                size="small" 
                danger
                @click="handleCancelSession(record.sessionId)"
              >
                Cancel
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:open="detailsModalVisible" title="Session Details" width="800px" :footer="null">
      <a-descriptions bordered :column="2">
        <a-descriptions-item label="Session ID">{{ selectedSession?.sessionId }}</a-descriptions-item>
        <a-descriptions-item label="Type">{{ selectedSession?.type }}</a-descriptions-item>
        <a-descriptions-item label="Status">{{ selectedSession?.status }}</a-descriptions-item>
        <a-descriptions-item label="Started At">{{ formatDate(selectedSession?.startedAt) }}</a-descriptions-item>
        <a-descriptions-item label="Duration">{{ formatDuration(selectedSession?.duration) }}</a-descriptions-item>
        <a-descriptions-item label="Client">{{ selectedSession?.client || 'N/A' }}</a-descriptions-item>
      </a-descriptions>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useSessionsStore } from '@/stores/sessions';
import { notification } from 'ant-design-vue';
import type { Session } from '@/types';
import type { Dayjs } from 'dayjs';

const sessionsStore = useSessionsStore();

const dateRange = ref<[Dayjs, Dayjs] | null>(null);
const typeFilter = ref<string>();
const statusFilter = ref<string>();
const detailsModalVisible = ref(false);
const selectedSession = ref<Session | null>(null);

const columns = [
  { title: 'Session ID', dataIndex: 'sessionId', key: 'sessionId' },
  { title: 'Type', dataIndex: 'type', key: 'type' },
  { title: 'Status', dataIndex: 'status', key: 'status' },
  { title: 'Started At', dataIndex: 'startedAt', key: 'startedAt' },
  { title: 'Duration', dataIndex: 'duration', key: 'duration' },
  { title: 'Client', dataIndex: 'client', key: 'client' },
  { title: 'Actions', key: 'actions' }
];

onMounted(() => {
  sessionsStore.fetchSessions();
});

function applyFilters() {
  const filters: any = {};
  
  if (dateRange.value) {
    filters.startDate = dateRange.value[0].toISOString();
    filters.endDate = dateRange.value[1].toISOString();
  }
  
  if (typeFilter.value) {
    filters.type = typeFilter.value;
  }
  
  if (statusFilter.value) {
    filters.status = statusFilter.value;
  }
  
  sessionsStore.setFilters(filters);
  sessionsStore.fetchSessions();
}

function getStatusBadge(status: string) {
  const statusMap: Record<string, 'success' | 'processing' | 'warning' | 'error' | 'default'> = {
    'in-progress': 'processing',
    'completed': 'success',
    'incomplete': 'warning',
    'failed': 'error'
  };
  return statusMap[status] || 'default';
}

function formatDate(dateString?: string): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString();
}

function formatDuration(seconds?: number): string {
  if (!seconds) return 'N/A';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function handleViewDetails(session: Session) {
  selectedSession.value = session;
  detailsModalVisible.value = true;
}

async function handleCancelSession(sessionId: string) {
  const result = await sessionsStore.cancelSession(sessionId);
  if (result.success) {
    notification.success({ message: 'Session canceled' });
  } else {
    notification.error({ message: 'Failed to cancel session', description: result.error });
  }
}
</script>

<style scoped>
.sessions-view {
  padding: 0;
}
</style>
