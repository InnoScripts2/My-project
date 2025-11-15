import express from 'express';
export function createArchiveRoutes() {
  const r = express.Router();
  r.get('/archive/ping', (_req,res) => res.json({ ok: true }));
  return r;
}
