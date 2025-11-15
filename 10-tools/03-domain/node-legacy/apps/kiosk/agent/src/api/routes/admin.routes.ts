import { Router, Request, Response } from 'express';

const router = Router();

// Mock data for development
const mockKiosks = [
  {
    kioskId: 'kiosk-001',
    location: 'Moscow Center',
    status: 'online',
    uptime: 86400,
    lastSeen: new Date().toISOString()
  },
  {
    kioskId: 'kiosk-002',
    location: 'St. Petersburg Mall',
    status: 'online',
    uptime: 172800,
    lastSeen: new Date().toISOString()
  },
  {
    kioskId: 'kiosk-003',
    location: 'Kazan Station',
    status: 'offline',
    uptime: 0,
    lastSeen: new Date(Date.now() - 3600000).toISOString()
  }
];

const mockSessions = [
  {
    sessionId: 'session-001',
    type: 'DIAGNOSTICS',
    status: 'completed',
    startedAt: new Date(Date.now() - 7200000).toISOString(),
    duration: 180,
    client: 'client@example.com'
  },
  {
    sessionId: 'session-002',
    type: 'THICKNESS',
    status: 'in-progress',
    startedAt: new Date(Date.now() - 600000).toISOString(),
    duration: 600,
    client: 'test@example.com'
  }
];

const mockAlerts = [
  {
    alertId: 'alert-001',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    severity: 'warning',
    name: 'Device Connection Issue',
    description: 'OBD adapter connection unstable',
    status: 'active'
  },
  {
    alertId: 'alert-002',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    severity: 'info',
    name: 'System Update Available',
    description: 'New firmware version available',
    status: 'acknowledged'
  }
];

// GET /api/kiosks - List kiosks
router.get('/kiosks', (req: Request, res: Response) => {
  res.json(mockKiosks);
});

// POST /api/kiosks/:id/restart - Restart kiosk
router.post('/kiosks/:id/restart', (req: Request, res: Response) => {
  const { id } = req.params;
  const kiosk = mockKiosks.find(k => k.kioskId === id);

  if (!kiosk) {
    return res.status(404).json({ error: 'Kiosk not found' });
  }

  res.json({ success: true, message: 'Kiosk restart initiated' });
});

// GET /api/kiosks/:id/logs - Get kiosk logs
router.get('/kiosks/:id/logs', (req: Request, res: Response) => {
  const { id } = req.params;
  const kiosk = mockKiosks.find(k => k.kioskId === id);

  if (!kiosk) {
    return res.status(404).json({ error: 'Kiosk not found' });
  }

  const mockLogs = [
    { timestamp: new Date().toISOString(), level: 'info', message: 'Session started' },
    { timestamp: new Date().toISOString(), level: 'info', message: 'OBD adapter connected' },
    { timestamp: new Date().toISOString(), level: 'warn', message: 'Device connection unstable' }
  ];

  res.json({ logs: mockLogs });
});

// GET /api/kiosks/:id/config - Get kiosk configuration
router.get('/kiosks/:id/config', (req: Request, res: Response) => {
  const { id } = req.params;
  const kiosk = mockKiosks.find(k => k.kioskId === id);

  if (!kiosk) {
    return res.status(404).json({ error: 'Kiosk not found' });
  }

  const mockConfig = {
    obdPort: 'COM3',
    obdBaudRate: 38400,
    thicknessDeviceId: 'AA:BB:CC:DD:EE:FF',
    yookassaShopId: '12345',
    smtpHost: 'smtp.example.com',
    smtpPort: 587
  };

  res.json(mockConfig);
});

// PUT /api/kiosks/:id/config - Update kiosk configuration
router.put('/kiosks/:id/config', (req: Request, res: Response) => {
  const { id } = req.params;
  const kiosk = mockKiosks.find(k => k.kioskId === id);

  if (!kiosk) {
    return res.status(404).json({ error: 'Kiosk not found' });
  }

  res.json({ success: true, message: 'Configuration updated' });
});

// GET /api/sessions - List sessions
router.get('/sessions', (req: Request, res: Response) => {
  res.json(mockSessions);
});

// POST /api/sessions/:id/cancel - Cancel session
router.post('/sessions/:id/cancel', (req: Request, res: Response) => {
  const { id } = req.params;
  const session = mockSessions.find(s => s.sessionId === id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({ success: true, message: 'Session canceled' });
});

// GET /api/monitoring/alerts - List alerts
router.get('/monitoring/alerts', (req: Request, res: Response) => {
  res.json(mockAlerts);
});

// POST /api/monitoring/alerts/:id/acknowledge - Acknowledge alert
router.post('/monitoring/alerts/:id/acknowledge', (req: Request, res: Response) => {
  const { id } = req.params;
  const alert = mockAlerts.find(a => a.alertId === id);

  if (!alert) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  alert.status = 'acknowledged';
  res.json({ success: true, message: 'Alert acknowledged' });
});

// POST /api/monitoring/alerts/:id/resolve - Resolve alert
router.post('/monitoring/alerts/:id/resolve', (req: Request, res: Response) => {
  const { id } = req.params;
  const alert = mockAlerts.find(a => a.alertId === id);

  if (!alert) {
    return res.status(404).json({ error: 'Alert not found' });
  }

  alert.status = 'resolved';
  res.json({ success: true, message: 'Alert resolved' });
});

// GET /api/analytics/dashboard - Get dashboard overview
router.get('/analytics/dashboard', (req: Request, res: Response) => {
  res.json({
    totalSessions: 156,
    totalRevenue: 74880,
    activeKiosks: 2,
    activeSessions: 1,
    trendsChart: {},
    topErrors: [],
    recentAlerts: mockAlerts
  });
});

// POST /auth/login - Authenticate user (DEV stub compatible with admin UI schema)
router.post('/auth/login', (req: Request, res: Response) => {
  const { email, password, token } = req.body || {};

  // Accept either email/password or one-time token in DEV
  const now = Date.now();
  const mk = (role: 'admin' | 'operator' = 'admin') => ({
    accessToken: `${role}.access.${now}`,
    refreshToken: `${role}.refresh.${now}`,
  });

  // Simple rules for dev:
  // - admin/admin or operator/operator
  // - any non-empty token
  if ((email === 'admin@example.com' && password === 'admin') || (email === 'admin' && password === 'admin')) {
    return res.json(mk('admin'));
  }
  if ((email === 'operator@example.com' && password === 'operator') || (email === 'operator' && password === 'operator')) {
    return res.json(mk('operator'));
  }
  if (typeof token === 'string' && token.trim().length > 0) {
    return res.json(mk('admin'));
  }

  res.status(401).json({ error: 'invalid_credentials' });
});

// POST /auth/refresh - Issue new access token (DEV stub)
router.post('/auth/refresh', (_req: Request, res: Response) => {
  const now = Date.now();
  res.json({ accessToken: `admin.access.${now}` });
});

export default router;
