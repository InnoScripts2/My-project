import { defineConfig } from 'vite';
import { createHtmlPlugin } from 'vite-plugin-html';
import path from 'path';

export default defineConfig(({ mode }) => ({
  root: '.',
  base: './',
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: mode === 'development',
    minify: mode === 'production' ? 'esbuild' : false,
    target: 'es2020',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },

  server: {
    port: 5173,
    host: true,
    strictPort: true,
    hmr: {
      overlay: true,
    },
  },

  preview: {
    port: 4173,
    host: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@screens': path.resolve(__dirname, './src/screens'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },

  plugins: [
    createHtmlPlugin({
      minify: mode === 'production',
      inject: {
        data: {
          title: 'Автосервис самообслуживания',
        },
      },
    }),
  ],

  define: {
    'import.meta.env.DEV': mode === 'development',
    'import.meta.env.PROD': mode === 'production',
  },

  css: {
    postcss: {
      plugins: [],
    },
  },
}));
