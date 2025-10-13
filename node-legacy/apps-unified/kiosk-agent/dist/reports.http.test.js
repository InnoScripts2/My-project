import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
test('POST /reports/generate writes HTML to outbox', { timeout: 15000 }, async (t) => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-reports-'));
    const prevOutbox = process.env.REPORTS_OUTBOX;
    process.env.REPORTS_OUTBOX = tmpRoot;
    const server = app.listen(0);
    t.after(() => {
        server.close();
        // restore env and cleanup temp dir best-effort
        if (prevOutbox === undefined)
            delete process.env.REPORTS_OUTBOX;
        else
            process.env.REPORTS_OUTBOX = prevOutbox;
        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
        catch {
            // ignore cleanup errors
        }
    });
    const baseUrl = await waitForServer(server);
    const payload = {
        data: {
            sessionId: 'sess-test-generate',
            contact: { email: 'example@test.local' },
            // mark as thickness report to exercise that branch
            points: [{ id: 'FL1', label: 'Лев. крыло 1', valueMicrons: 120 }],
            summary: 'Пробный отчёт для теста генерации.'
        }
    };
    const res = await fetch(new URL('/reports/generate', baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.match(String(body.id), /^sess-test-generate-/);
    assert.ok(typeof body.html === 'string' && body.html.length > 0);
    assert.equal(fs.existsSync(body.html), true, 'generated HTML file should exist');
    const html = fs.readFileSync(body.html, 'utf8');
    assert.ok(html.toLowerCase().startsWith('<!doctype html>'));
    assert.ok(html.includes('Отчёт: толщинометрия'));
});
test('POST /reports/send returns 501 when SMTP is not configured (or 200 in DEV with simulation)', { timeout: 15000 }, async (t) => {
    // Ensure no SMTP env is set
    const smtpEnv = {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM,
    };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
    const server = app.listen(0);
    t.after(() => {
        server.close();
        // restore SMTP env
        if (smtpEnv.host !== undefined)
            process.env.SMTP_HOST = smtpEnv.host;
        else
            delete process.env.SMTP_HOST;
        if (smtpEnv.port !== undefined)
            process.env.SMTP_PORT = smtpEnv.port;
        else
            delete process.env.SMTP_PORT;
        if (smtpEnv.secure !== undefined)
            process.env.SMTP_SECURE = smtpEnv.secure;
        else
            delete process.env.SMTP_SECURE;
        if (smtpEnv.user !== undefined)
            process.env.SMTP_USER = smtpEnv.user;
        else
            delete process.env.SMTP_USER;
        if (smtpEnv.pass !== undefined)
            process.env.SMTP_PASS = smtpEnv.pass;
        else
            delete process.env.SMTP_PASS;
        if (smtpEnv.from !== undefined)
            process.env.SMTP_FROM = smtpEnv.from;
        else
            delete process.env.SMTP_FROM;
    });
    const baseUrl = await waitForServer(server);
    const payload = {
        data: {
            sessionId: 'sess-test-send',
            contact: { email: 'dev@example.com' },
            dtc: [],
            mil: false,
        }
    };
    const res = await fetch(new URL('/reports/send', baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const body = await res.json();
    // In DEV we simulate sending and return 200; in QA/PROD without SMTP expect 501
    if (res.status === 200) {
        assert.equal(body.ok, true);
        assert.ok(typeof body.id === 'string' && body.id.length > 0);
    }
    else {
        assert.equal(res.status, 501);
        assert.equal(body.ok, false);
        assert.equal(body.error, 'email_not_configured');
    }
});
test('GET /reports/view/:id returns 404 for unknown id', { timeout: 15000 }, async (t) => {
    const server = app.listen(0);
    t.after(() => server.close());
    const baseUrl = await waitForServer(server);
    const res = await fetch(new URL('/reports/view/non-existent-id', baseUrl));
    assert.equal(res.status, 404);
});
test('POST /reports/send-sms returns 501 when SMS not configured (or 200 in DEV with provider=dev)', { timeout: 15000 }, async (t) => {
    const prevProvider = process.env.SMS_PROVIDER;
    delete process.env.SMS_PROVIDER;
    const server = app.listen(0);
    t.after(() => {
        server.close();
        if (prevProvider !== undefined)
            process.env.SMS_PROVIDER = prevProvider;
        else
            delete process.env.SMS_PROVIDER;
    });
    const baseUrl = await waitForServer(server);
    const payload = {
        data: {
            sessionId: 'sess-test-sms',
            contact: { phone: '+79990000000' },
            dtc: [],
            mil: false,
        },
    };
    const res = await fetch(new URL('/reports/send-sms', baseUrl), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    const body = await res.json();
    if (res.status === 200) {
        assert.equal(body.ok, true);
        assert.ok(typeof body.id === 'string' && body.id.length > 0);
    }
    else {
        assert.equal(res.status, 501);
        assert.equal(body.ok, false);
        assert.equal(body.error, 'sms_not_configured');
    }
});
