import express from 'express';
export function createMediaRoutes() {
  const r = express.Router();
  r.get('/media/ping', (_req,res) => res.json({ ok: true }));
  return r;
}
