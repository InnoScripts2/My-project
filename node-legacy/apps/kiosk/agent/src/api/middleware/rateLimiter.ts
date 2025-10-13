/**
 * Rate Limiting Middleware
 * Simple in-memory rate limiter for API endpoints
 */

import type { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10;

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(store.entries());
  for (const [key, entry] of entries) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  // Skip localhost in DEV mode
  const env = process.env.AGENT_ENV || 'DEV';
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  
  if (env === 'DEV' && (ip === '127.0.0.1' || ip === '::1' || ip.includes('localhost'))) {
    next();
    return;
  }

  const now = Date.now();
  const key = `rate-limit:${ip}`;
  
  let entry = store.get(key);
  
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + WINDOW_MS,
    };
    store.set(key, entry);
    next();
    return;
  }

  if (entry.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.status(429)
      .set('Retry-After', String(retryAfter))
      .json({
        error: 'rate_limit_exceeded',
        message: 'Too many requests, please try again later',
        retryAfter,
      });
    return;
  }

  entry.count++;
  next();
}
