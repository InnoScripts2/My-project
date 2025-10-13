import { diagnosticsEventStore as sqliteDiagnosticsStore } from '../sqlite/diagnosticsEventStore.js';
const mode = process.env.AGENT_PERSISTENCE?.toLowerCase();
let diagnosticsStore = sqliteDiagnosticsStore;
if (mode === 'supabase') {
    try {
        const mod = await import('./SupabaseDiagnosticsEventStore.js');
        diagnosticsStore = mod.createSupabaseDiagnosticsEventStore();
    }
    catch (err) {
        console.warn('[diagnostics-store] failed to init Supabase store, falling back to SQLite:', err);
        diagnosticsStore = sqliteDiagnosticsStore;
    }
}
else if (mode === 'pg' || mode === 'postgres' || mode === 'postgresql') {
    try {
        const mod = await import('./PostgresDiagnosticsEventStore.js');
        diagnosticsStore = mod.createPostgresDiagnosticsEventStore();
    }
    catch (err) {
        console.warn('[diagnostics-store] failed to init Postgres store, falling back to SQLite:', err);
        diagnosticsStore = sqliteDiagnosticsStore;
    }
}
export const diagnosticsEventStore = diagnosticsStore;
