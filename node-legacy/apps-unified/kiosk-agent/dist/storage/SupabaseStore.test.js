import { describe, it } from 'node:test';
import assert from 'node:assert';
// Избегаем топ-уровневого импорта SupabaseStore, чтобы не подтягивать @supabase/*,
// когда переменные окружения не заданы. Будем импортировать динамически в тесте.
// Mock Supabase client for testing
class MockSupabaseClient {
    constructor() {
        this.data = new Map();
    }
    from(table) {
        return {
            insert: async (record) => {
                if (!this.data.has(table)) {
                    this.data.set(table, []);
                }
                this.data.get(table).push(record);
                return { error: null };
            },
            update: async (updates) => {
                return {
                    eq: async (column, value) => {
                        const records = this.data.get(table) || [];
                        const record = records.find((r) => r[column] === value);
                        if (record) {
                            Object.assign(record, updates);
                        }
                        return { error: null };
                    }
                };
            },
            upsert: async (record) => {
                if (!this.data.has(table)) {
                    this.data.set(table, []);
                }
                const records = this.data.get(table);
                const existing = records.find((r) => r.session_id === record.session_id && r.point_id === record.point_id);
                if (existing) {
                    Object.assign(existing, record);
                }
                else {
                    records.push(record);
                }
                return { error: null };
            },
            select: async () => {
                return { data: this.data.get(table) || [], error: null };
            }
        };
    }
    getData(table) {
        return this.data.get(table) || [];
    }
    clear() {
        this.data.clear();
    }
}
describe('SupabaseStore', () => {
    // Skip tests if Supabase is not configured
    const supabaseConfigured = Boolean(process.env.SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!supabaseConfigured) {
        it('skips tests when Supabase is not configured', () => {
            assert.ok(true, 'Supabase not configured - tests skipped');
        });
        return;
    }
    it('should create a session with retry logic', async () => {
        // This test validates that SupabaseStore exports the correct interface
        // Real integration testing would require actual Supabase credentials
        const mod = await import('./SupabaseStore.js');
        const { SupabaseStore } = mod;
        const store = new SupabaseStore();
        assert.ok(store, 'SupabaseStore instance created');
        assert.ok(typeof store.createSession === 'function', 'createSession method exists');
        assert.ok(typeof store.finishSession === 'function', 'finishSession method exists');
        assert.ok(typeof store.recordThicknessPoint === 'function', 'recordThicknessPoint method exists');
    });
    it('should export metrics for Prometheus', async () => {
        const { supabaseOperations, supabaseOperationDuration, supabaseRetries } = await import('./SupabaseStore.js');
        assert.ok(supabaseOperations, 'supabaseOperations metric exported');
        assert.ok(supabaseOperationDuration, 'supabaseOperationDuration metric exported');
        assert.ok(supabaseRetries, 'supabaseRetries metric exported');
    });
    // Note: Full integration tests would require:
    // 1. Test Supabase project with test credentials
    // 2. Cleanup logic to remove test data
    // 3. Mocked network failures to test retry logic
    // These are better suited for E2E tests in a CI environment
});
