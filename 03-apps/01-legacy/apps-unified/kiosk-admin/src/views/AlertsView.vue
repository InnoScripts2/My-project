<template>
  <div class="alerts-view">
    <a-card title="Alerts Management">
      <template #extra>
        <a-space>
          <a-select v-model:value="severityFilter" placeholder="Filter by severity" style="width: 150px" allow-clear>
            <a-select-option value="critical">Critical</a-select-option>
            <a-select-option value="warning">Warning</a-select-option>
            <a-select-option value="info">Info</a-select-option>
          </a-select>
          <a-select v-model:value="statusFilter" placeholder="Filter by status" style="width: 150px" allow-clear>
            <a-select-option value="active">Active</a-select-option>
            <a-select-option value="acknowledged">Acknowledged</a-select-option>
            <a-select-option value="resolved">Resolved</a-select-option>
          </a-select>
        </a-space>
      </template>

      <a-table 
        :columns="columns" 
        :data-source="filteredAlerts" 
        :loading="alertsStore.loading"
        row-key="alertId"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'timestamp'">
            {{ formatDate(record.timestamp) }}
          </template>
          <template v-else-if="column.key === 'severity'">
            <a-badge :status="getSeverityBadge(record.severity)" :text="record.severity" />
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="getStatusColor(record.status)">{{ record.status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button 
                v-if="record.status === 'active'" 
                size="small" 
                @click="handleAcknowledge(record.alertId)"
              >
                Acknowledge
              </a-button>
              <a-button 
                v-if="record.status !== 'resolved'" 
                size="small" 
                type="primary"
                @click="handleResolve(record.alertId)"
              >
                Resolve
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAlertsStore } from '@/stores/alerts';
import { notification } from 'ant-design-vue';

const alertsStore = useAlertsStore();

const severityFilter = ref<string>();
const statusFilter = ref<string>();

const columns = [
  { title: 'Timestamp', dataIndex: 'timestamp', key: 'timestamp' },
  { title: 'Severity', dataIndex: 'severity', key: 'severity' },
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Description', dataIndex: 'description', key: 'description' },
  { title: 'Status', dataIndex: 'status', key: 'status' },
  { title: 'Actions', key: 'actions' }
];

const filteredAlerts = computed(() => {
  let result = alertsStore.alerts;
  
  if (severityFilter.value) {
    result = result.filter(a => a.severity === severityFilter.value);
  }
  
  if (statusFilter.value) {
    result = result.filter(a => a.status === statusFilter.value);
  }
  
  return result;
});

onMounted(() => {
  alertsStore.fetchAlerts();
});

function getSeverityBadge(severity: string) {
  const severityMap: Record<string, 'success' | 'processing' | 'warning' | 'error' | 'default'> = {
    'critical': 'error',
    'warning': 'warning',
    'info': 'processing'
  };
  return severityMap[severity] || 'default';
}

function getStatusColor(status: string) {
  const colorMap: Record<string, string> = {
    'active': 'red',
    'acknowledged': 'orange',
    'resolved': 'green'
  };
  return colorMap[status] || 'default';
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

async function handleAcknowledge(alertId: string) {
  const result = await alertsStore.acknowledgeAlert(alertId);
  if (result.success) {
    notification.success({ message: 'Alert acknowledged' });
  } else {
    notification.error({ message: 'Failed to acknowledge alert', description: result.error });
  }
}

async function handleResolve(alertId: string) {
  const result = await alertsStore.resolveAlert(alertId);
  if (result.success) {
    notification.success({ message: 'Alert resolved' });
  } else {
    notification.error({ message: 'Failed to resolve alert', description: result.error });
  }
}
</script>

<style scoped>
.alerts-view {
  padding: 0;
}
</style>
