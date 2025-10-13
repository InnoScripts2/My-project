import { Router, Request, Response } from 'express';

export function createAdminRoutes(): Router {
  const router = Router();

  // POST /api/auth/login — DEV-стаб совместимый с админ-UI
  router.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = (req.body || {}) as { username?: string; password?: string };

    const mk = (role: 'admin' | 'operator') => {
      const now = Date.now();
      const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();
      return {
        token: `${role}.access.${now}`,
        user: {
          id: role === 'admin' ? 'u-admin' : 'u-operator',
          username: role,
          role,
        },
        expiresAt,
      };
    };

    if ((username === 'admin' && password === 'admin') || (username === 'admin@example.com' && password === 'admin')) {
      return res.json(mk('admin'));
    }
    if ((username === 'operator' && password === 'operator') || (username === 'operator@example.com' && password === 'operator')) {
      return res.json(mk('operator'));
    }

    return res.status(401).json({ error: 'invalid_credentials' });
  });

  // POST /api/auth/refresh — DEV-стаб
  router.post('/api/auth/refresh', (_req: Request, res: Response) => {
    const now = Date.now();
    res.json({ token: `admin.access.${now}`, expiresAt: new Date(now + 60 * 60 * 1000).toISOString() });
  });

  return router;
}
