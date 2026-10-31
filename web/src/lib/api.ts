/** 统一 API 客户端：优先带 Cookie，同时支持本地存 token（Electron/Tauri 客户端用） */

const TOKEN_KEY = 'zhuopu.token';

export class ApiError extends Error {
    status: number;
    payload: unknown;
    constructor(message: string, status: number, payload?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.payload = payload;
    }
}

export function getToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setToken(token: string | null): void {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch {
        /* 隐私模式下忽略 */
    }
}

type Options = {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    /** 直接传 FormData */
    form?: FormData;
    signal?: AbortSignal;
    /** 返回原始响应（导出文件用） */
    raw?: boolean;
};

/**
 * API 前缀：
 *   - 网页端：同源（''）
 *   - Electron：同源（主进程有本地静态服务器 + /api 反向代理）
 *   - Tauri：页面来自 tauri://localhost，没有代理，必须直连线上服务器
 */
const API_BASE: string = (() => {
    if (typeof window === 'undefined') return '';
    const w = window as Window & { __ZHUOPU_API_BASE__?: string; __TAURI_INTERNALS__?: unknown };
    if (w.__ZHUOPU_API_BASE__) return w.__ZHUOPU_API_BASE__;
    if (w.__TAURI_INTERNALS__) return 'https://zhuopu.xuanjian.top';
    return '';
})();

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (opts.form) {
        body = opts.form;
    } else if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.body);
    }

    const res = await fetch(API_BASE + path, {
        method: opts.method ?? (body ? 'POST' : 'GET'),
        headers,
        body,
        credentials: 'include',
        signal: opts.signal
    });

    if (opts.raw) {
        if (!res.ok) throw new ApiError(`请求失败（${res.status}）`, res.status);
        return (await res) as unknown as T;
    }

    const text = await res.text();
    let json: unknown = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = { error: text.slice(0, 200) };
    }

    if (!res.ok) {
        const message = (json as { error?: string })?.error || `请求失败（${res.status}）`;
        throw new ApiError(message, res.status, json);
    }
    return json as T;
}

/** 下载文件：走带鉴权的 fetch，再触发浏览器保存 */
export async function download(path: string, filename: string): Promise<void> {
    const res = await api<Response>(path, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
