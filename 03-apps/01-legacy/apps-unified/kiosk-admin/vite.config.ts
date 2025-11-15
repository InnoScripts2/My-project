import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  // Базовый путь для GitHub Pages публикации под /admin/
  base: '/admin/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:7081',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:7081',
        ws: true
      }
    }
  },
  test: {
    globals: true,
    environment: 'happy-dom'
  }
});
