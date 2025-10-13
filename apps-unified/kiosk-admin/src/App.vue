<template>
  <a-config-provider :locale="locale">
    <router-view v-if="!requiresLayout" />
    <MainLayout v-else />
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { ConfigProvider as AConfigProvider } from 'ant-design-vue';
import MainLayout from '@/layouts/MainLayout.vue';
import { useRealtimeStore } from '@/stores/realtime';
import ruRU from 'ant-design-vue/es/locale/ru_RU';

const route = useRoute();
const realtimeStore = useRealtimeStore();

const locale = ruRU;

const requiresLayout = computed(() => {
  return route.name !== 'Login';
});

onMounted(() => {
  if (requiresLayout.value) {
    realtimeStore.initWebSocket();
  }
});

onUnmounted(() => {
  realtimeStore.disconnect();
});
</script>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app {
  min-height: 100vh;
}
</style>
