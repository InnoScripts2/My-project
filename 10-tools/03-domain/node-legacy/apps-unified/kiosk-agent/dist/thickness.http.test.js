import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from './index.js';
// Diagnostics for elusive uncaught errors in CI
process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error('[test][uncaughtException]', err, { proto: Object.getPrototypeOf(err) });
});
process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[test][unhandledRejection]', reason, { proto: reason ? Object.getPrototypeOf(reason) : null });
});
const waitForServer = async (server) => {
    if (!server.listening) {
        await new Promise((resolve) => server.once('listening', () => resolve()));
    }
    const address = server.address();
    assert.ok(address && typeof address === 'object', 'server should provide an address');
    const { port } = address;
    assert.ok(typeof port === 'number' && port > 0, 'server must listen on a port');
    return `http://127.0.0.1:${port}`;
};
test('Thickness API basic flow', { timeout: 15000 }, async (t) => {
    const server = app.listen(0);
    t.after(() => server.close());
    const baseUrl = await waitForServer(server);
    // Snapshot should be ok
    let res = await fetch(new URL('/api/thk/snapshot', baseUrl));
    assert.equal(res.status, 200);
    let body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.snapshot);
    // Open with BLE hints
    res = await fetch(new URL('/api/thk/open', baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'sedan', deviceName: 'DEV-THK', serviceUuid: '0000' })
    });
    body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.snapshot.state, 'connected');
    // Points template
    res = await fetch(new URL('/api/thk/points-template?type=sedan', baseUrl));
    body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.points));
    const pointsCount = body.points.length;
    assert.ok(pointsCount >= 24);
    // Start session
    res = await fetch(new URL('/api/thk/start', baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'sedan' })
    });
    body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.session.active, true);
    assert.equal(body.session.pendingCount, pointsCount);
    // Mark one point (DEV only)
    res = await fetch(new URL('/api/thk/mark-point', baseUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.session.skippedCount, 1);
    // Session snapshot
    res = await fetch(new URL('/api/thk/session', baseUrl));
    body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.session.active, true);
    // Stop session
    res = await fetch(new URL('/api/thk/stop', baseUrl), { method: 'POST' });
    body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.session.active, false);
});
