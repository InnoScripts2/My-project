<template>
  <a-layout style="min-height: 100vh">
    <a-layout-sider v-model:collapsed="collapsed" collapsible>
      <div class="logo">Admin Console</div>
      <a-menu v-model:selectedKeys="selectedKeys" theme="dark" mode="inline">
        <a-menu-item key="dashboard">
          <router-link to="/dashboard">
            <span>{{ t("menu.dashboard") }}</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="kiosks">
          <router-link to="/kiosks">
            <span>{{ t("menu.kiosks") }}</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="sessions">
          <router-link to="/sessions">
            <span>{{ t("menu.sessions") }}</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="alerts">
          <router-link to="/alerts">
            <span>{{ t("menu.alerts") }}</span>
            <a-badge :count="unacknowledgedAlertsCount" :offset="[10, 0]" />
          </router-link>
        </a-menu-item>
      </a-menu>
    </a-layout-sider>

    <a-layout>
      <a-layout-header
        style="
          background: #fff;
          padding: 0 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        "
      >
        <div style="font-size: 16px; font-weight: 500">
          {{ t("appTitle") }}
        </div>
        <div>
          <a-select
            v-model:value="locale"
            style="width: 100px; margin-right: 12px"
          >
            <a-select-option value="ru">RU</a-select-option>
            <a-select-option value="en">EN</a-select-option>
          </a-select>
          <span style="margin-right: 16px">{{ username || t("user") }}</span>
          <a-button type="primary" @click="onLogout">{{
            t("logout")
          }}</a-button>
        </div>
      </a-layout-header>
      <a-layout-content style="margin: 16px">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter, useRoute } from "vue-router";
import { useAlertsStore } from "@/stores/alerts";
import { authService } from "@/services/AuthService";

const router = useRouter();
const route = useRoute();
const alertsStore = useAlertsStore();
const { t, locale: i18nLocale } = useI18n();

const collapsed = ref(false);
const selectedKeys = ref<string[]>(["dashboard"]);
const username = computed(() => authService.getUsername() || "User");
const locale = ref<string>(String(i18nLocale.value || "ru"));

const unacknowledgedAlertsCount = computed(
  () => alertsStore.unacknowledgedCount
);

watch(
  () => route.name,
  (newName) => {
    if (newName) {
      selectedKeys.value = [String(newName).toLowerCase()];
    }
  },
  { immediate: true }
);

watch(locale, (val) => {
  (i18nLocale as any).value = val as any;
});

function onLogout() {
  authService.logout();
  router.push("/login");
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
