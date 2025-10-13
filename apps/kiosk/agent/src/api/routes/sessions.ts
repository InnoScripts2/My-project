/**
 * Session API routes
 */

import { Router } from 'express';
import type { SessionManager } from '../../sessions/manager.js';

export function createSessionRoutes(sessionManager: SessionManager): Router {
  const router = Router();

  // Create new session
  router.post('/sessions', async (req, res) => {
    try {
      const { type, contact, metadata, ttlMs } = req.body;

      if (!type || !['thickness', 'diagnostics'].includes(type)) {
        return res.status(400).json({ error: 'Invalid session type' });
      }

      if (!contact || (!contact.email && !contact.phone)) {
        return res.status(400).json({ error: 'Contact information required' });
      }

      const session = await sessionManager.createSession({
        type,
        contact,
        metadata,
        ttlMs,
      });

      res.status(201).json(session);
    } catch (error: any) {
      console.error('[Sessions API] Create error:', error);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // Get session by ID
  router.get('/sessions/:id', async (req, res) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json(session);
    } catch (error: any) {
      console.error('[Sessions API] Get error:', error);
      res.status(500).json({ error: 'Failed to get session' });
    }
  });

  // Update session
  router.patch('/sessions/:id', async (req, res) => {
    try {
      const { status, contact, metadata, completedAt } = req.body;

      const session = await sessionManager.updateSession(req.params.id, {
        status,
        contact,
        metadata,
        completedAt,
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json(session);
    } catch (error: any) {
      console.error('[Sessions API] Update error:', error);
      res.status(500).json({ error: 'Failed to update session' });
    }
  });

  // Complete session
  router.post('/sessions/:id/complete', async (req, res) => {
    try {
      const session = await sessionManager.completeSession(
        req.params.id,
        req.body.metadata
      );

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json(session);
    } catch (error: any) {
      console.error('[Sessions API] Complete error:', error);
      res.status(500).json({ error: 'Failed to complete session' });
    }
  });

  // Expire session
  router.post('/sessions/:id/expire', async (req, res) => {
    try {
      const session = await sessionManager.expireSession(req.params.id);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json(session);
    } catch (error: any) {
      console.error('[Sessions API] Expire error:', error);
      res.status(500).json({ error: 'Failed to expire session' });
    }
  });

  // List sessions
  router.get('/sessions', async (req, res) => {
    try {
      const { type, status, limit } = req.query;

      const sessions = sessionManager.listSessions({
        type: type as string,
        status: status as string,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      res.json({ sessions, count: sessions.length });
    } catch (error: any) {
      console.error('[Sessions API] List error:', error);
      res.status(500).json({ error: 'Failed to list sessions' });
    }
  });

  // Delete session
  router.delete('/sessions/:id', async (req, res) => {
    try {
      const deleted = await sessionManager.deleteSession(req.params.id);

      if (!deleted) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.status(204).send();
    } catch (error: any) {
      console.error('[Sessions API] Delete error:', error);
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  return router;
}
