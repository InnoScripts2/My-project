import { randomUUID } from 'node:crypto';
export function generateSelfCheckId(prefix) {
    try {
        return `${prefix}_${randomUUID()}`;
    }
    catch {
        return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
}
