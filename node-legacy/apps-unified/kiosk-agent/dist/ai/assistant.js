function getSupabaseEdgeUrl() {
    const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base)
        return undefined;
    try {
        return new URL("/functions/v1/ai-chat", base).toString();
    }
    catch {
        return undefined;
    }
}
export async function fetchAiInsights(payload, opts) {
    const url = getSupabaseEdgeUrl();
    const key = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        throw Object.assign(new Error("ai_not_configured"), { code: "ai_not_configured" });
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), Math.max(1500, opts?.timeoutMs ?? 4000));
    const system = "Ты помощник по диагностике автомобиля. Отвечай кратко, по фактам, без выдумок. Если не уверенно — предупреждай. Формат ответа: компактный JSON с полями summary, severity, recommendations (title+steps), disclaimer.";
    const user = {
        role: "user",
        content: `Вот фактические данные диагностики OBD-II в JSON. Проанализируй коды DTC и статусы, оцени критичность и предложи понятные шаги. Данные: ${JSON.stringify(payload)}`,
    };
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ messages: [{ role: "system", content: system }, user] }),
            signal: ctrl.signal,
        });
        clearTimeout(t);
        const data = await res.json().catch(() => ({}));
        const text = data?.message || data?.choices?.[0]?.message?.content;
        if (!text)
            return { summary: "Нет ответа от ИИ", disclaimer: "Сервис ИИ недоступен.", raw: JSON.stringify(data).slice(0, 1000) };
        // Попробуем JSON-парсинг
        try {
            const parsed = JSON.parse(text);
            const summary = typeof parsed.summary === "string" && parsed.summary.length ? parsed.summary : text;
            return {
                summary,
                severity: parsed.severity,
                recommendations: parsed.recommendations,
                disclaimer: parsed.disclaimer || "Советы носят справочный характер. Для точной оценки обратитесь к специалисту.",
                raw: text,
            };
        }
        catch {
            return { summary: text, disclaimer: "Ответ ИИ в свободной форме.", raw: text };
        }
    }
    catch (e) {
        clearTimeout(t);
        if (e?.name === "AbortError") {
            return { summary: "Время ожидания ИИ истекло", disclaimer: "Повторите попытку позже." };
        }
        throw e;
    }
}
export function buildPayloadFromDtc(dtc, status) {
    return {
        dtc: dtc.map(d => ({ code: d.code, description: d.description })),
        status,
    };
}
