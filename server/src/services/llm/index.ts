import { env } from '../../env.js';
import { logger } from '../../logger.js';
import { get, now, run } from '../../db/index.js';
import { decrypt } from '../../lib/crypto.js';

export type Provider = 'deepseek' | 'glm';

export interface ChatOptions {
    system: string;
    user: string;
    provider?: Provider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    /** 调用用途，写入 llm_usage.purpose */
    purpose?: string;
    userId?: number | null;
    /** 超时（毫秒） */
    timeoutMs?: number;
    /** 是否要求 JSON 输出（默认 true） */
    json?: boolean;
}

export interface ChatResult<T = unknown> {
    data: T;
    raw: string;
    provider: Provider;
    model: string;
    usage: { prompt: number; completion: number; total: number };
    latencyMs: number;
}

/* ---------- 设置读取（后台可改，优先于 .env） ---------- */

function setting(key: string): string {
    return get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? '';
}

export function providerConfig(p: Provider) {
    if (p === 'deepseek') {
        const dbKey = decrypt(setting('llm.deepseek.apiKey'));
        return {
            baseUrl: env.llm.deepseek.baseUrl,
            apiKey: dbKey || env.llm.deepseek.apiKey,
            model: setting('llm.deepseek.model') || env.llm.deepseek.model
        };
    }
    const dbKey = decrypt(setting('llm.glm.apiKey'));
    return {
        baseUrl: env.llm.glm.baseUrl,
        apiKey: dbKey || env.llm.glm.apiKey,
        model: setting('llm.glm.model') || env.llm.glm.model
    };
}

export function defaultProvider(): Provider {
    const v = setting('llm.defaultProvider') || 'deepseek';
    return v === 'glm' ? 'glm' : 'deepseek';
}

export function providerStatus() {
    const list: Provider[] = ['deepseek', 'glm'];
    return list.map((p) => {
        const c = providerConfig(p);
        return { provider: p, model: c.model, configured: !!c.apiKey, baseUrl: c.baseUrl };
    });
}

/* ---------- JSON 提取与轻量修复 ---------- */

export function extractJson(raw: string): unknown {
    let text = String(raw ?? '').trim();
    // 去掉 ```json ... ``` 包裹
    const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
    if (fence) text = fence[1]!.trim();
    // 取第一个 { 到最后一个 } 之间
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);

    const attempts: string[] = [text];
    // 常见修复：尾逗号、中文引号、未转义换行
    attempts.push(text.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"').replace(/[‘’]/g, "'"));
    for (const candidate of attempts) {
        try {
            return JSON.parse(candidate);
        } catch { /* 继续尝试 */ }
    }
    throw Object.assign(new Error('模型返回的内容不是合法 JSON'), { raw: text.slice(0, 800) });
}

/* ---------- 调用 ---------- */

function recordUsage(row: {
    userId?: number | null; provider: Provider; model: string; purpose: string;
    prompt: number; completion: number; total: number; latencyMs: number; ok: boolean; error?: string;
}) {
    run(
        `INSERT INTO llm_usage (user_id, provider, model, purpose, prompt_tokens, completion_tokens, total_tokens, latency_ms, ok, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.userId ?? null, row.provider, row.model, row.purpose,
        row.prompt, row.completion, row.total, row.latencyMs, row.ok ? 1 : 0, row.error ?? '', now()
    );
}

async function postChat(
    baseUrl: string,
    apiKey: string,
    body: Record<string, unknown>,
    timeoutMs: number
): Promise<{ status: number; json: any; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        const text = await res.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* 非 JSON 响应 */ }
        return { status: res.status, json, text };
    } finally {
        clearTimeout(timer);
    }
}

export async function chatJson<T = unknown>(opts: ChatOptions): Promise<ChatResult<T>> {
    const provider = opts.provider || defaultProvider();
    const cfg = providerConfig(provider);
    if (!cfg.apiKey) {
        throw Object.assign(new Error(`未配置 ${provider} 的 API Key，请到后台「模型设置」填写`), { status: 400 });
    }
    const model = opts.model || cfg.model;
    const timeoutMs = opts.timeoutMs ?? 180_000;
    const jsonMode = opts.json !== false;
    const messages = [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user }
    ];

    const baseBody: Record<string, unknown> = {
        model,
        messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 4096,
        stream: false
    };

    let lastError = '';
    let latencyMs = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    for (let attempt = 1; attempt <= 2; attempt++) {
        const body = { ...baseBody, ...(jsonMode ? { response_format: { type: 'json_object' } } : {}) };
        const started = Date.now();
        try {
            const r = await postChat(cfg.baseUrl, cfg.apiKey, body, timeoutMs);
            latencyMs = Date.now() - started;
            if (r.status >= 200 && r.status < 300) {
                const content: string = r.json?.choices?.[0]?.message?.content ?? '';
                const u = r.json?.usage ?? {};
                promptTokens = Number(u.prompt_tokens ?? 0);
                completionTokens = Number(u.completion_tokens ?? 0);
                totalTokens = Number(u.total_tokens ?? (promptTokens + completionTokens));
                if (!content.trim()) {
                    lastError = '模型返回空内容';
                    continue;
                }
                const data = jsonMode ? (extractJson(content) as T) : (content as unknown as T);
                recordUsage({ userId: opts.userId, provider, model, purpose: opts.purpose || '', prompt: promptTokens, completion: completionTokens, total: totalTokens, latencyMs, ok: true });
                return { data, raw: content, provider, model, usage: { prompt: promptTokens, completion: completionTokens, total: totalTokens }, latencyMs };
            }
            lastError = `HTTP ${r.status}: ${r.text.slice(0, 300)}`;
            // 4xx（除限流）基本是参数/鉴权问题，不再重试
            if (r.status === 401 || r.status === 403) break;
        } catch (e) {
            latencyMs = Date.now() - started;
            lastError = (e as Error).name === 'AbortError' ? `请求超时（${timeoutMs}ms）` : (e as Error).message;
        }
        logger.warn(`${provider}/${model} 第 ${attempt} 次调用失败：${lastError}`);
    }

    recordUsage({ userId: opts.userId, provider, model, purpose: opts.purpose || '', prompt: promptTokens, completion: completionTokens, total: totalTokens, latencyMs, ok: false, error: lastError });
    throw Object.assign(new Error(`模型调用失败：${lastError}`), { status: 502 });
}
