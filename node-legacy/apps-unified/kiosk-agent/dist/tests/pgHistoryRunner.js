process.env.AGENT_ENV = process.env.AGENT_ENV || 'DEV';
process.env.AGENT_PERSISTENCE = 'pg';
const { app } = await import('../index.js');
const { diagnosticSessionManager } = await import('../devices/obd/DiagnosticSessionManager.js');
function addr(server) {
    const a = server.address();
    if (!a || typeof a !== 'object')
        throw new Error('no address');
    const { port } = a;
    return `http://127.0.0.1:${port}`;
}
async function main() {
    const server = app.listen(0);
    const baseUrl = addr(server);
    try {
        // Produce some events
        await diagnosticSessionManager.runOperation('read_dtc', async () => ({ ok: true, data: [] }), { attempts: 1, baseDelayMs: 0 });
        try {
            await diagnosticSessionManager.runOperation('live_data', async () => { throw new Error('live_fail'); }, { attempts: 1, baseDelayMs: 0 });
        }
        catch {
            // expected failure to generate failure events
        }
        const res = await fetch(new URL('/api/obd/diagnostics/history', baseUrl));
        const body = await res.json();
        if (res.status !== 200) {
            console.error('history status', res.status, body);
            process.exit(2);
        }
        if (!body?.ok || !body?.summary) {
            console.error('invalid body', body);
            process.exit(3);
        }
        if (!body.summary.operations?.trends || !body.summary.rolling) {
            console.error('missing trends/rolling', body.summary);
            process.exit(4);
        }
        console.log('OK');
        process.exit(0);
    }
    catch (err) {
        console.error('runner error', err);
        process.exit(1);
    }
    finally {
        server.close();
    }
}
await main();
export {};
