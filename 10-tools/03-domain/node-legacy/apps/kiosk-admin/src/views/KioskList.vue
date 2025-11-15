<template>
  <div class="kiosk-list">
    <a-card title="Kiosks Management">
      <template #extra>
        <a-space>
          <a-select v-model:value="statusFilter" placeholder="Filter by status" style="width: 150px" allow-clear>
            <a-select-option value="online">Online</a-select-option>
            <a-select-option value="offline">Offline</a-select-option>
            <a-select-option value="maintenance">Maintenance</a-select-option>
          </a-select>
          <a-input-search v-model:value="searchText" placeholder="Search by ID or location" style="width: 250px" />
        </a-space>
      </template>

      <a-table 
        :columns="columns" 
        :data-source="filteredKiosks" 
        :loading="kiosksStore.loading"
        row-key="kioskId"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-badge :status="getStatusBadge(record.status)" :text="record.status" />
          </template>
          <template v-else-if="column.key === 'uptime'">
            {{ formatUptime(record.uptime) }}
          </template>
          <template v-else-if="column.key === 'lastSeen'">
            {{ formatDate(record.lastSeen) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button size="small" @click="handleRestart(record.kioskId)">Restart</a-button>
              <a-button size="small" @click="handleViewLogs(record.kioskId)">View Logs</a-button>
              <a-button size="small" @click="handleConfigure(record.kioskId)">Configure</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:open="logsModalVisible" title="Kiosk Logs" width="800px" :footer="null">
      <a-spin :spinning="logsLoading">
        <pre style="max-height: 400px; overflow-y: auto; background: #f5f5f5; padding: 12px; border-radius: 4px;">{{ logs }}</pre>
      </a-spin>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useKiosksStore } from '@/stores/kiosks';
import { notification } from 'ant-design-vue';
import axios from 'axios';

const router = useRouter();
const kiosksStore = useKiosksStore();

const statusFilter = ref<string>();
const searchText = ref('');
const logsModalVisible = ref(false);
const logsLoading = ref(false);
const logs = ref('');

const columns = [
  { title: 'Kiosk ID', dataIndex: 'kioskId', key: 'kioskId' },
  { title: 'Location', dataIndex: 'location', key: 'location' },
  { title: 'Status', dataIndex: 'status', key: 'status' },
  { title: 'Uptime', dataIndex: 'uptime', key: 'uptime' },
  { title: 'Last Seen', dataIndex: 'lastSeen', key: 'lastSeen' },
  { title: 'Actions', key: 'actions' }
];

const filteredKiosks = computed(() => {
  let result = kiosksStore.kiosks;
  
  if (statusFilter.value) {
    result = result.filter(k => k.status === statusFilter.value);
  }
  
  if (searchText.value) {
    const search = searchText.value.toLowerCase();
    result = result.filter(k => 
      k.kioskId.toLowerCase().includes(search) || 
      k.location.toLowerCase().includes(search)
    );
  }
  
  return result;
});

onMounted(() => {
  kiosksStore.fetchKiosksList();
});

function getStatusBadge(status: string) {
  const statusMap: Record<string, 'success' | 'processing' | 'warning' | 'error' | 'default'> = {
    'online': 'success',
    'offline': 'error',
    'maintenance': 'warning'
  };
  return statusMap[status] || 'default';
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

async function handleRestart(kioskId: string) {
  const result = await kiosksStore.restartKiosk(kioskId);
  if (result.success) {
    notification.success({ message: 'Kiosk restart initiated' });
  } else {
    notification.error({ message: 'Failed to restart kiosk', description: result.error });
  }
}

async function handleViewLogs(kioskId: string) {
  logsModalVisible.value = true;
  logsLoading.value = true;
  logs.value = '';
  
  try {
    const response = await axios.get(`/api/kiosks/${kioskId}/logs`);
    logs.value = response.data.logs.map((log: any) => 
      `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`
    ).join('\n');
  } catch (error: any) {
    notification.error({ message: 'Failed to load logs', description: error.message });
    logs.value = 'Failed to load logs';
  } finally {
    logsLoading.value = false;
  }
}

function handleConfigure(kioskId: string) {
  router.push(`/config/${kioskId}`);
}
</script>

<style scoped>
.kiosk-list {
  padding: 0;
}
</style>
