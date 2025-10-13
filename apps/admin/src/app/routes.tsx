import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy } from 'react';
import AdminLayout from './layout/AdminLayout';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Sessions = lazy(() => import('./pages/Sessions'));
const SessionDetails = lazy(() => import('./pages/SessionDetails'));
const Monitoring = lazy(() => import('./pages/Monitoring'));
const Settings = lazy(() => import('./pages/Settings'));

export const router = createBrowserRouter(
  [
    {
      path: '/login',
      element: <Login />,
    },
    {
      path: '/',
      element: <AdminLayout />,
      children: [
        {
          index: true,
          element: <Dashboard />,
        },
        {
          path: 'sessions',
          element: <Sessions />,
        },
        {
          path: 'sessions/:id',
          element: <SessionDetails />,
        },
        {
          path: 'monitoring',
          element: <Monitoring />,
        },
        {
          path: 'settings',
          element: <Settings />,
        },
      ],
    },
    {
      path: '*',
      element: <Navigate to="/" replace />,
    },
  ],
  {
    basename: '/admin',
  }
);
