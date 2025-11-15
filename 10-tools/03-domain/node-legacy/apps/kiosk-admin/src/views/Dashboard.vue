<template>
  <div class="dashboard">
    <a-row :gutter="16">
      <a-col :span="6">
        <a-card>
          <a-statistic title="Total Sessions" :value="totalSessions" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="Total Revenue" :value="totalRevenue" prefix="₽" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="Active Kiosks" :value="activeKiosks" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card>
          <a-statistic title="Active Sessions" :value="activeSessions" />
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="16" style="margin-top: 16px">
      <a-col :span="16">
        <a-card title="Sessions & Revenue Trends" :loading="loading">
          <div style="height: 300px; display: flex; align-items: center; justify-content: center;">
            <span v-if="!loading">Chart will be displayed here</span>
          </div>
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card title="Recent Alerts" :loading="loading">
          <a-list :data-source="recentAlerts" size="small">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-list-item-meta>
                  <template #title>
                    <a-badge :status="getBadgeStatus(item.severity)" :text="item.name" />
                  </template>
                  <template #description>
                    {{ item.description }}
                  </template>
                </a-list-item-meta>
              </a-list-item>
            </template>
          </a-list>
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="16" style="margin-top: 16px">
      <a-col :span="24">
        <a-card title="Device Status" :loading="loading">
          <a-descriptions bordered :column="2">
            <a-descriptions-item label="OBD Adapter">
              <a-badge status="success" text="Connected" />
            </a-descriptions-item>
            <a-descriptions-item label="Thickness Meter">
              <a-badge status="success" text="Connected" />
            </a-descriptions-item>
          </a-descriptions>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAnalyticsStore } from '@/stores/analytics';
import { useKiosksStore } from '@/stores/kiosks';
import { useAlertsStore } from '@/stores/alerts';

const analyticsStore = useAnalyticsStore();
const kiosksStore = useKiosksStore();
const alertsStore = useAlertsStore();

const loading = ref(false);

const totalSessions = computed(() => analyticsStore.overviewDashboard?.totalSessions || 0);
const totalRevenue = computed(() => analyticsStore.overviewDashboard?.totalRevenue || 0);
const activeKiosks = computed(() => kiosksStore.onlineKiosks.length);
const activeSessions = computed(() => analyticsStore.overviewDashboard?.activeSessions || 0);
const recentAlerts = computed(() => alertsStore.activeAlerts.slice(0, 5));

onMounted(async () => {
  loading.value = true;
  try {
    await Promise.all([
      analyticsStore.fetchOverviewDashboard(),
      kiosksStore.fetchKiosksList(),
      alertsStore.fetchAlerts()
    ]);
  } finally {
    loading.value = false;
  }
});

function getBadgeStatus(severity: string) {
  const statusMap: Record<string, 'success' | 'processing' | 'warning' | 'error' | 'default'> = {
    'critical': 'error',
    'warning': 'warning',
    'info': 'processing'
  };
  return statusMap[severity] || 'default';
}
</script>

<style scoped>
.dashboard {
  padding: 0;
}
</style>
