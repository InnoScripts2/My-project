<template>
  <a-layout style="min-height: 100vh">
    <a-layout-sider v-model:collapsed="collapsed" collapsible>
      <div class="logo">Admin Console</div>
      <a-menu v-model:selectedKeys="selectedKeys" theme="dark" mode="inline">
        <a-menu-item key="dashboard">
          <router-link to="/dashboard">
            <span>Dashboard</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="kiosks">
          <router-link to="/kiosks">
            <span>Kiosks</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="sessions">
          <router-link to="/sessions">
            <span>Sessions</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="alerts">
          <router-link to="/alerts">
            <span>Alerts</span>
            <a-badge :count="unacknowledgedAlertsCount" :offset="[10, 0]" />
          </router-link>
        </a-menu-item>
      </a-menu>
    </a-layout-sider>

    <a-layout>
      <a-layout-header style="background: #fff; padding: 0 24px; display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 16px; font-weight: 500;">
          Kiosk Management System
        </div>
        <div>
          <span style="margin-right: 16px;">{{ username }}</span>
          <a-button type="primary" @click="onLogout">Logout</a-button>
        </div>
      </a-layout-header>
      <a-layout-content style="margin: 16px">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAlertsStore } from '@/stores/alerts';
import { authService } from '@/services/AuthService';

const router = useRouter();
const route = useRoute();
const alertsStore = useAlertsStore();

const collapsed = ref(false);
const selectedKeys = ref<string[]>(['dashboard']);
const username = computed(() => authService.getUsername() || 'User');

const unacknowledgedAlertsCount = computed(() => alertsStore.unacknowledgedCount);

watch(
  () => route.name,
  (newName) => {
    if (newName) {
      selectedKeys.value = [String(newName).toLowerCase()];
    }
  },
  { immediate: true }
);

function onLogout() {
  authService.logout();
  router.push('/login');
}
</script>

<style scoped>
.logo {
  height: 32px;
  margin: 16px;
  color: white;
  font-size: 18px;
  font-weight: bold;
  text-align: center;
}
</style>
