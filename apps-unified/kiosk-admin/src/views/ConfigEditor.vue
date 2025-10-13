<template>
  <div class="config-editor">
    <a-card :title="`Configuration for Kiosk ${kioskId}`">
      <a-spin :spinning="configStore.loading">
        <a-form
          :model="configForm"
          :rules="configRules"
          @finish="onSaveConfig"
          layout="vertical"
        >
          <a-collapse v-model:activeKey="activeKey" :bordered="false">
            <a-collapse-panel key="devices" header="Devices Configuration">
              <a-form-item label="OBD Port" name="obdPort">
                <a-input
                  v-model:value="configForm.obdPort"
                  placeholder="e.g., COM3"
                />
              </a-form-item>
              <a-form-item label="OBD Baud Rate" name="obdBaudRate">
                <a-input-number
                  v-model:value="configForm.obdBaudRate"
                  :min="9600"
                  :max="115200"
                  style="width: 100%"
                />
              </a-form-item>
              <a-form-item
                label="Thickness Device ID (BLE)"
                name="thicknessDeviceId"
              >
                <a-input
                  v-model:value="configForm.thicknessDeviceId"
                  placeholder="e.g., AA:BB:CC:DD:EE:FF"
                />
              </a-form-item>
            </a-collapse-panel>

            <a-collapse-panel key="payments" header="Payments Configuration">
              <a-form-item label="YooKassa Shop ID" name="yookassaShopId">
                <a-input
                  v-model:value="configForm.yookassaShopId"
                  placeholder="Shop ID"
                />
              </a-form-item>
              <a-form-item label="YooKassa API Key" name="yookassaApiKey">
                <a-input-password
                  v-model:value="configForm.yookassaApiKey"
                  placeholder="API Key (optional)"
                />
              </a-form-item>
            </a-collapse-panel>

            <a-collapse-panel key="reports" header="Reports Configuration">
              <a-form-item label="SMTP Host" name="smtpHost">
                <a-input
                  v-model:value="configForm.smtpHost"
                  placeholder="e.g., smtp.example.com"
                />
              </a-form-item>
              <a-form-item label="SMTP Port" name="smtpPort">
                <a-input-number
                  v-model:value="configForm.smtpPort"
                  :min="1"
                  :max="65535"
                  style="width: 100%"
                />
              </a-form-item>
              <a-form-item label="SMTP User" name="smtpUser">
                <a-input
                  v-model:value="configForm.smtpUser"
                  placeholder="SMTP username (optional)"
                />
              </a-form-item>
              <a-form-item label="SMTP Password" name="smtpPassword">
                <a-input-password
                  v-model:value="configForm.smtpPassword"
                  placeholder="SMTP password (optional)"
                />
              </a-form-item>
            </a-collapse-panel>
          </a-collapse>

          <a-form-item style="margin-top: 24px">
            <a-space>
              <a-button
                type="primary"
                html-type="submit"
                :loading="configStore.loading"
              >
                Save Changes
              </a-button>
              <a-button @click="handleDiscard">Discard</a-button>
              <a-button @click="handleReset">Reset to Default</a-button>
            </a-space>
          </a-form-item>
        </a-form>
      </a-spin>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useConfigStore } from "@/stores/config";
import { notification } from "ant-design-vue";
import type { KioskConfig } from "@/types";

const route = useRoute();
const configStore = useConfigStore();

const kioskId = ref(route.params.kioskId as string);
const activeKey = ref(["devices"]);
const configForm = ref<KioskConfig>({
  obdPort: "",
  obdBaudRate: 38400,
  thicknessDeviceId: "",
  yookassaShopId: "",
  yookassaApiKey: "",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPassword: "",
});

const configRules = {
  obdPort: [{ required: true, message: "Please input OBD port" }],
  obdBaudRate: [{ required: true, message: "Please input baud rate" }],
  thicknessDeviceId: [{ required: true, message: "Please input device ID" }],
  yookassaShopId: [{ required: true, message: "Please input shop ID" }],
  smtpHost: [{ required: true, message: "Please input SMTP host" }],
};

onMounted(async () => {
  await configStore.fetchConfig(kioskId.value);
  if (configStore.config) {
    configForm.value = { ...configStore.config };
  }
});

watch(
  () => configStore.config,
  (newConfig) => {
    if (newConfig) {
      configForm.value = { ...newConfig };
    }
  }
);

async function onSaveConfig() {
  const result = await configStore.saveConfig(kioskId.value, configForm.value);
  if (result.success) {
    notification.success({ message: "Configuration saved successfully" });
  } else {
    notification.error({
      message: "Failed to save configuration",
      description: result.error,
    });
  }
}

function handleDiscard() {
  if (configStore.config) {
    configForm.value = { ...configStore.config };
    notification.info({ message: "Changes discarded" });
  }
}

function handleReset() {
  configForm.value = {
    obdPort: "COM3",
    obdBaudRate: 38400,
    thicknessDeviceId: "",
    yookassaShopId: "",
    yookassaApiKey: "",
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPassword: "",
  };
  notification.info({ message: "Reset to default values" });
}
</script>

<style scoped>
.config-editor {
  padding: 0;
}
</style>
