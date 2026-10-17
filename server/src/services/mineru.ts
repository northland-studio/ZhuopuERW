import { unzipSync } from 'fflate';
import { env } from '../env.js';
import { logger } from '../logger.js';

/**
 * MinerU 标准 API（/api/v4）：把 docx/pdf/图片 解析成 Markdown
 *   1) POST /extract/task  { url, model_version, is_ocr, ... } → task_id
 *   2) GET  /extract/task/{task_id} → state: pending|running|converting|done|failed, full_zip_url
 *   3) 下载 zip，取里面最大的 .md 作为正文
 */

export interface MineruTask {
    taskId: string;
}

export interface MineruResult {
    markdown: string;
    pages?: number;
}

function headers(): Record<string, string> {
    if (!env.mineru.token) throw Object.assign(new Error('MinerU Token 未配置'), { status: 500 });
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.mineru.token}`
    };
}

/** 把 MinerU 业务码翻译成可读错误 */
const ERROR_HINTS: Record<string, string> = {
    A0202: 'MinerU Token 无效',
    A0211: 'MinerU Token 已过期',
    '-500': 'MinerU 参数错误',
    '-10001': 'MinerU 服务异常',
    '-10002': 'MinerU 参数不合法',
    '-60002': 'MinerU 不支持该文件格式',
    '-60003': 'MinerU 读取文件失败（文件链接是否可公开访问？）',
    '-60004': 'MinerU 收到空文件',
    '-60005': '文件超过 200MB',
    '-60006': '页数超过 200 页',
    '-60008': 'MinerU 读取文件超时（URL 不可达）',
    '-60010': 'MinerU 解析失败',
    '-60018': 'MinerU 当日配额已用完'
};

async function callJson(url: string, init: RequestInit): Promise<any> {
    const res = await fetch(url, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON */ }

    // 网关层失败：{"success":false,"msgCode":"A0202","msg":"..."}
    if (json && json.success === false) {
        const hint = ERROR_HINTS[String(json.msgCode)] || json.msg || 'MinerU 请求失败';
        throw Object.assign(new Error(`MinerU：${hint}`), { status: 502, code: json.msgCode });
    }
    if (!res.ok) {
        throw Object.assign(new Error(`MinerU HTTP ${res.status}: ${text.slice(0, 200)}`), { status: 502 });
    }
    if (!json) throw Object.assign(new Error(`MinerU 返回非 JSON：${text.slice(0, 200)}`), { status: 502 });
    if (json.code !== 0) {
        const hint = ERROR_HINTS[String(json.code)] || json.msg || 'MinerU 请求失败';
        throw Object.assign(new Error(`MinerU：${hint}`), { status: 502, code: json.code });
    }
    return json.data;
}

/** 创建解析任务（url 必须是公网可访问地址，例如七牛 CDN 链接） */
export async function createTask(
    fileUrl: string,
    opts: { isOcr?: boolean; modelVersion?: string; language?: string } = {}
): Promise<MineruTask> {
    const body = {
        url: fileUrl,
        model_version: opts.modelVersion || env.mineru.modelVersion,
        is_ocr: opts.isOcr ?? false,
        enable_formula: false,
        enable_table: false,
        language: opts.language || 'en',
        data_id: `zhuopu-${Date.now()}`
    };
    const data = await callJson(`${env.mineru.baseUrl}/api/v4/extract/task`, {
        method: 'POST',
        body: JSON.stringify(body)
    });
    if (!data?.task_id) throw Object.assign(new Error('MinerU 未返回 task_id'), { status: 502 });
    logger.info(`MinerU 任务已创建：${data.task_id}（url=${fileUrl.slice(0, 80)}）`);
    return { taskId: data.task_id };
}

/** 轮询任务直到 done / failed / 超时 */
export async function waitTask(taskId: string, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<{ state: string; zipUrl?: string; errMsg?: string }> {
    const timeout = opts.timeoutMs ?? env.mineru.timeoutMs;
    const interval = opts.intervalMs ?? env.mineru.pollIntervalMs;
    const started = Date.now();
    let lastState = 'pending';

    while (Date.now() - started < timeout) {
        const data = await callJson(`${env.mineru.baseUrl}/api/v4/extract/task/${encodeURIComponent(taskId)}`, { method: 'GET' });
        lastState = String(data?.state ?? '');
        if (lastState === 'done') return { state: 'done', zipUrl: data?.full_zip_url };
        if (lastState === 'failed') return { state: 'failed', errMsg: data?.err_msg || '解析失败' };
        await new Promise((r) => setTimeout(r, interval));
    }
    return { state: 'timeout', errMsg: `解析超时（等待 ${Math.round((Date.now() - started) / 1000)} 秒）` };
}

/** 从 zip 里取出正文 Markdown（取最大的 .md，排除图片与清单） */
export async function downloadMarkdown(zipUrl: string): Promise<string> {
    const res = await fetch(zipUrl);
    if (!res.ok) throw Object.assign(new Error(`下载 MinerU 结果失败：HTTP ${res.status}`), { status: 502 });
    const buf = new Uint8Array(await res.arrayBuffer());
    const files = unzipSync(buf);
    const candidates = Object.entries(files)
        .filter(([name]) => /\.md$/i.test(name))
        .sort((a, b) => b[1].length - a[1].length);
    if (!candidates.length) throw Object.assign(new Error('MinerU 结果里没有 Markdown'), { status: 502 });
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(candidates[0]![1]);
}

/** 一步到位：URL → Markdown */
export async function extractMarkdown(
    fileUrl: string,
    opts: { isOcr?: boolean; timeoutMs?: number } = {}
): Promise<MineruResult> {
    const task = await createTask(fileUrl, { isOcr: opts.isOcr });
    const done = await waitTask(task.taskId, { timeoutMs: opts.timeoutMs });
    if (done.state !== 'done' || !done.zipUrl) {
        throw Object.assign(new Error(`MinerU 解析未完成：${done.state}${done.errMsg ? '，' + done.errMsg : ''}`), { status: 502 });
    }
    const markdown = await downloadMarkdown(done.zipUrl);
    return { markdown };
}

/**
 * 上传到 MinerU 自有存储再解析（推荐路径）
 *
 * 为什么不用「七牛 URL → MinerU」：MinerU 服务端要去抓这个 URL，
 * 如果 CDN 域名卡在 Cloudflare 回源证书（Full strict）上，它会直接报
 * "failed to read file"。走 MinerU 的预签名上传可以完全绕开外部可达性问题。
 */
export async function uploadAndExtract(
    buffer: Buffer,
    filename: string,
    opts: { isOcr?: boolean; timeoutMs?: number } = {}
): Promise<MineruResult> {
    const dataId = `zhuopu-${Date.now().toString(36)}`;
    const created = await callJson(`${env.mineru.baseUrl}/api/v4/file-urls/batch`, {
        method: 'POST',
        body: JSON.stringify({
            files: [{ name: filename, data_id: dataId }],
            model_version: env.mineru.modelVersion,
            is_ocr: opts.isOcr ?? false,
            enable_formula: false,
            enable_table: false,
            language: 'en'
        })
    });

    const batchId: string = created?.batch_id;
    const fileUrl: string | undefined = created?.file_urls?.[0];
    if (!batchId || !fileUrl) {
        throw Object.assign(new Error('MinerU 未返回上传地址'), { status: 502 });
    }

    // PUT 到预签名地址：不要带 Content-Type
    const put = await fetch(fileUrl, { method: 'PUT', body: buffer });
    if (!put.ok) {
        throw Object.assign(new Error(`上传到 MinerU 失败：HTTP ${put.status}`), { status: 502 });
    }
    logger.info(`已上传到 MinerU：${filename}（${buffer.length} 字节，batch=${batchId}）`);

    const timeout = opts.timeoutMs ?? env.mineru.timeoutMs;
    const interval = env.mineru.pollIntervalMs;
    const started = Date.now();
    let state = 'pending';
    let zipUrl: string | undefined;

    while (Date.now() - started < timeout) {
        const data = await callJson(
            `${env.mineru.baseUrl}/api/v4/extract-results/batch/${encodeURIComponent(batchId)}`,
            { method: 'GET' }
        );
        const item = Array.isArray(data?.extract_result) ? data.extract_result[0] : null;
        state = String(item?.state ?? 'pending');
        if (state === 'done') { zipUrl = item?.full_zip_url; break; }
        if (state === 'failed') {
            throw Object.assign(new Error(`MinerU 解析失败：${item?.err_msg || '未知原因'}`), { status: 502 });
        }
        await new Promise((r) => setTimeout(r, interval));
    }

    if (state !== 'done' || !zipUrl) {
        throw Object.assign(new Error(`MinerU 解析超时（${state}）`), { status: 504 });
    }
    const markdown = await downloadMarkdown(zipUrl);
    return { markdown };
}

export function mineruStatus() {
    return {
        configured: !!env.mineru.token,
        baseUrl: env.mineru.baseUrl,
        model: env.mineru.modelVersion,
        timeoutMs: env.mineru.timeoutMs
    };
}
