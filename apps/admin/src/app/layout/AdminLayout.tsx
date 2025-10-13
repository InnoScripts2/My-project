import { Suspense, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  IconDashboard,
  IconList,
  IconChartLine,
  IconSettings,
  IconLogout,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { isAuthenticated, clearTokens } from '@/store/auth';

const drawerWidth = 240;

const menuItems = [
  { key: 'dashboard', path: '/', icon: IconDashboard, label: 'nav.dashboard' },
  { key: 'sessions', path: '/sessions', icon: IconList, label: 'nav.sessions' },
  { key: 'monitoring', path: '/monitoring', icon: IconChartLine, label: 'nav.monitoring' },
  { key: 'settings', path: '/settings', icon: IconSettings, label: 'nav.settings' },
];

export default function AdminLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
    }
  }, [navigate]);

  const handleLogout = () => {
    clearTokens();
    navigate('/login');
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" sx={{ zIndex: theme => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Admin Console
          </Typography>
          <IconButton color="inherit" onClick={handleLogout}>
            <IconLogout />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems.map(item => (
              <ListItem key={item.key} disablePadding>
                <ListItemButton onClick={() => handleNavigate(item.path)}>
                  <ListItemIcon>
                    <item.icon />
                  </ListItemIcon>
                  <ListItemText primary={t(item.label)} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Suspense
          fallback={
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <CircularProgress />
            </Box>
          }
        >
          <Outlet />
        </Suspense>
      </Box>
    </Box>
  );
}
