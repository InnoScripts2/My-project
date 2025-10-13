<template>
  <div class="login-page">
    <a-card title="Admin Console Login" style="width: 400px; margin: 100px auto;">
      <a-form @finish="onLogin" :model="loginForm">
        <a-form-item label="Username" name="username" :rules="[{ required: true, message: 'Please input username' }]">
          <a-input v-model:value="loginForm.username" placeholder="Enter username" />
        </a-form-item>
        <a-form-item label="Password" name="password" :rules="[{ required: true, message: 'Please input password' }]">
          <a-input-password v-model:value="loginForm.password" placeholder="Enter password" />
        </a-form-item>
        <a-form-item>
          <a-button type="primary" html-type="submit" :loading="loading" block>Login</a-button>
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { authService } from '@/services/AuthService';
import { notification } from 'ant-design-vue';

const router = useRouter();
const loginForm = ref({ username: '', password: '' });
const loading = ref(false);

async function onLogin() {
  loading.value = true;
  try {
    const result = await authService.login(loginForm.value.username, loginForm.value.password);
    if (result.success) {
      notification.success({ message: 'Login successful' });
      router.push('/dashboard');
    }
  } catch (error: any) {
    notification.error({ 
      message: 'Login failed', 
      description: error.response?.data?.message || error.message 
    });
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f2f5;
}
</style>
