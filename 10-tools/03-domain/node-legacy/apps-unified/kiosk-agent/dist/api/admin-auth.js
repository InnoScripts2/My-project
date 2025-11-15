/**
 * Admin API authentication middleware with HMAC-SHA256
 */
import crypto from 'crypto';
import { config } from '../config/loader.js';
// Nonce replay protection (in-memory LRU cache)
class NonceCache {
    constructor() {
        this.cache = new Map();
        this.maxSize = 1000;
        this.ttlMs = 5 * 60 * 1000; // 5 minutes
    }
    add(nonce) {
        const now = Date.now();
        // Check if nonce already exists
        if (this.cache.has(nonce)) {
            return false; // Replay detected
        }
        // Add nonce
        this.cache.set(nonce, now);
        // Cleanup old entries
        if (this.cache.size > this.maxSize) {
            const expireTime = now - this.ttlMs;
            for (const [key, time] of this.cache.entries()) {
                if (time < expireTime) {
                    this.cache.delete(key);
                }
            }
        }
        return true;
    }
}
const nonceCache = new NonceCache();
/**
 * Calculate HMAC-SHA256 signature
 */
function calculateSignature(method, path, body, timestamp, nonce, secret) {
    const canonical = `${method}\n${path}\n${body}\n${timestamp}\n${nonce}`;
    return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}
/**
 * Verify admin request authentication
 */
function verifyAdminAuth(req) {
    const keyId = req.headers['x-key-id'];
    const signature = req.headers['x-admin-signature'];
    const timestamp = req.headers['x-timestamp'];
    const nonce = req.headers['x-nonce'];
    // Check required headers
    if (!keyId || !signature || !timestamp || !nonce) {
        return {
            authenticated: false,
            error: 'Missing required auth headers'
        };
    }
    // Check timestamp drift (max 60 seconds)
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);
    if (isNaN(requestTime) || Math.abs(now - requestTime) > 60000) {
        return {
            authenticated: false,
            error: 'Timestamp drift too large'
        };
    }
    // Check nonce replay
    if (!nonceCache.add(nonce)) {
        return {
            authenticated: false,
            error: 'Nonce replay detected'
        };
    }
    // Get API key
    const apiKeys = config.get('ADMIN_API_KEYS') || {};
    const secret = apiKeys[keyId];
    if (!secret) {
        return {
            authenticated: false,
            error: 'Invalid key ID'
        };
    }
    // Calculate expected signature
    const body = JSON.stringify(req.body || {});
    const expectedSignature = calculateSignature(req.method, req.path, body, timestamp, nonce, secret);
    // Compare signatures
    if (signature !== expectedSignature) {
        return {
            authenticated: false,
            error: 'Invalid signature'
        };
    }
    return {
        authenticated: true,
        keyId
    };
}
/**
 * Admin authentication middleware
 */
export function adminAuthMiddleware(req, res, next) {
    const result = verifyAdminAuth(req);
    if (!result.authenticated) {
        res.status(401).json({
            error: 'authentication_failed',
            message: result.error || 'Authentication failed'
        });
        return;
    }
    // Store keyId in request for logging
    req.adminKeyId = result.keyId;
    next();
}
/**
 * Helper to generate signature for clients
 */
export function generateAdminSignature(method, path, body, keyId, secret) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const bodyStr = JSON.stringify(body || {});
    const signature = calculateSignature(method, path, bodyStr, timestamp, nonce, secret);
    return { signature, timestamp, nonce };
}
