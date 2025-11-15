/**
 * Supabase Client для Update Agent
 *
 * Клиент для подключения к Supabase с использованием API ключа клиента.
 * Обеспечивает аутентификацию через custom headers вместо JWT.
 */
import { createClient } from '@supabase/supabase-js';
let supabaseInstance = null;
/**
 * Инициализировать Supabase клиент
 */
export function initSupabase(config) {
    if (supabaseInstance) {
        return supabaseInstance;
    }
    supabaseInstance = createClient(config.supabaseUrl, config.supabaseApiKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
        global: {
            headers: {
                'x-api-key': config.supabaseApiKey,
                'x-client-id': config.clientId,
            },
        },
    });
    return supabaseInstance;
}
/**
 * Получить существующий Supabase клиент
 */
export function getSupabase() {
    if (!supabaseInstance) {
        throw new Error('Supabase client not initialized. Call initSupabase() first.');
    }
    return supabaseInstance;
}
/**
 * Зарегистрировать клиента в Supabase
 */
export async function registerClient(config) {
    const supabase = getSupabase();
    // Проверить существует ли клиент
    const { data: existing } = await supabase
        .from('clients')
        .select('id')
        .eq('client_id', config.clientId)
        .single();
    if (existing) {
        // Обновить существующего клиента
        const { error } = await supabase
            .from('clients')
            .update({
            platform: config.platform,
            hostname: config.hostname,
            last_seen: new Date().toISOString(),
            status: 'active',
        })
            .eq('client_id', config.clientId);
        if (error) {
            throw new Error(`Failed to update client: ${error.message}`);
        }
        return existing.id;
    }
    // Создать нового клиента
    const { data, error } = await supabase
        .from('clients')
        .insert({
        client_id: config.clientId,
        api_key: config.supabaseApiKey,
        platform: config.platform,
        hostname: config.hostname,
        status: 'active',
        metadata: {
            app_root: config.appRootDir,
        },
    })
        .select('id')
        .single();
    if (error) {
        throw new Error(`Failed to register client: ${error.message}`);
    }
    return data.id;
}
/**
 * Обновить app_version клиента
 */
export async function updateClientVersion(config, version) {
    const supabase = getSupabase();
    const { error } = await supabase
        .from('clients')
        .update({ app_version: version })
        .eq('client_id', config.clientId);
    if (error) {
        console.error('Failed to update client version:', error);
    }
}
