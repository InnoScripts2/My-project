import { Router } from 'express';
export function createAdminRoutes() {
    const router = Router();
    // POST /api/auth/login — DEV-стаб совместимый с админ-UI
    router.post('/api/auth/login', (req, res) => {
        const { username, password } = (req.body || {});
        const mk = (role) => {
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
    router.post('/api/auth/refresh', (_req, res) => {
        const now = Date.now();
        res.json({ token: `admin.access.${now}`, expiresAt: new Date(now + 60 * 60 * 1000).toISOString() });
    });
    return router;
}
