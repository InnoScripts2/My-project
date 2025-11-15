import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { authService } from '@/services/AuthService';
import { notification } from 'ant-design-vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginPage.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/kiosks',
    name: 'KioskList',
    component: () => import('@/views/KioskList.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/sessions',
    name: 'SessionsView',
    component: () => import('@/views/SessionsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/alerts',
    name: 'AlertsView',
    component: () => import('@/views/AlertsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/config/:kioskId',
    name: 'ConfigEditor',
    component: () => import('@/views/ConfigEditor.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/workflows',
    name: 'WorkflowsView',
    component: () => import('@/views/WorkflowsView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const requiresAuth = to.meta.requiresAuth;
  const requiresAdmin = to.meta.requiresAdmin;
  const isAuthenticated = authService.isAuthenticated();
  const userRole = authService.getUserRole();

  if (requiresAuth && !isAuthenticated) {
    next('/login');
  } else if (requiresAdmin && userRole !== 'admin') {
    notification.error({ 
      message: 'Access denied', 
      description: 'Admin role required' 
    });
    next('/dashboard');
  } else {
    next();
  }
});

export default router;
