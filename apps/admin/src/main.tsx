import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { router } from './app/routes';
import { loadRuntimeConfig } from './store/config';
import './i18n';
import './styles/globals.css';
import * as Sentry from '@sentry/browser';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

async function init() {
  try {
    const config = await loadRuntimeConfig();

    if (config.sentryDsn) {
      Sentry.init({
        dsn: config.sentryDsn,
        environment: (import.meta as { env?: { MODE?: string } }).env?.MODE || 'production',
        tracesSampleRate: 0.1,
        beforeSend(event) {
          if (event.request?.headers) {
            delete event.request.headers['authorization'];
            delete event.request.headers['cookie'];
          }
          return event;
        },
      });
    }

    const root = document.getElementById('root');
    if (!root) {
      throw new Error('Root element not found');
    }

    createRoot(root).render(
      <React.StrictMode>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <QueryClientProvider client={queryClient}>
            <SnackbarProvider maxSnack={3} autoHideDuration={3000}>
              <RouterProvider router={router} />
            </SnackbarProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </React.StrictMode>
    );
  } catch (error) {
    console.error('Failed to initialize app:', error);
    document.body.innerHTML = '<h1>Ошибка загрузки приложения</h1>';
  }
}

init();
