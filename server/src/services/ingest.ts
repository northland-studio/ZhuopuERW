import path from 'node:path';
import mammoth from 'mammoth';
import { logger } from '../logger.js';
import { env } from '../env.js';
import { uploadBuffer, recordUpload } from './qiniu.js';
import { uploadAndExtract, mineruStatus } from './mineru.js';
import { cleanMarkdown } from '../lib/markdown.js';

export type IngestSource = 'text' | 'docx' | 'pdf' | 'image' | 'mineru';

export interface IngestResult {
    /** 提取出的正文（md/txt 文本或解析后的 Markdown） */
    text: string;
    /** 实际走的通道 */
    source: IngestSource;
    /** 文件在七牛的公开地址（图片/文档才有） */
    fileUrl?: string;
    /** 给老师的提示，如「按扫描件 OCR 处理」 */
    note?: string;
}

const TEXT_EXT = new Set(['.md', '.markdown', '.txt', '.text']);
const DOC_EXT = new Set(['.docx', '.doc']);
const PDF_EXT = new Set(['.pdf']);
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.jp2']);

function kindOf(filename: string, mime: string): 'text' | 'docx' | 'pdf' | 'image' | 'unknown' {
    const ext = path.extname(filename).toLowerCase();
    if (TEXT_EXT.has(ext) || mime.startsWith('text/')) return 'text';
    if (DOC_EXT.has(ext) || mime.includes('wordprocessingml') || mime === 'application/msword') return 'docx';
    if (PDF_EXT.has(ext) || mime === 'application/pdf') return 'pdf';
    if (IMG_EXT.has(ext) || mime.startsWith('image/')) return 'image';
    return 'unknown';
}

/** 本地解析 docx（兜底路径） */
async function docxToText(buffer: Buffer): Promise<string> {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
}

/** 本地解析文字版 PDF（兜底路径） */
async function pdfToText(buffer: Buffer): Promise<string> {
    // pdf-parse 直接 import 会在 ESM 下触发它的自测分支，因此走子路径
    const mod: any = await import('pdf-parse/lib/pdf-parse.js');
    const pdfParse = mod.default ?? mod;
    const data = await pdfParse(buffer);
    return String(data.text ?? '');
}

/** 判断文本质量：太短或乱码过多视为「需要 OCR」 */
function poorText(text: string): boolean {
    const t = text.replace(/\s+/g, '');
    if (t.length < 200) return true;
    const bad = (text.match(/[\uFFFD]/g) || []).length;
    return bad > text.length * 0.02;
}

/**
 * 统一入口：把老师上传的文件变成可交给 LLM 的文字
 * - md/txt：直接读
 * - docx/pdf：先传七牛拿公开地址 → MinerU 转 Markdown（失败则本地解析兜底）
 * - 图片：传七牛（不经源站）→ MinerU OCR
 */
export async function ingestFile(input: {
    buffer: Buffer;
    filename: string;
    mime: string;
    userId?: number | null;
}): Promise<IngestResult> {
    const kind = kindOf(input.filename, input.mime);
    logger.info(`文件接入：${input.filename}（${input.mime || '未知类型'}，${input.buffer.length} 字节，判定=${kind}）`);

    if (kind === 'text') {
        const text = input.buffer.toString('utf8');
        return { text, source: 'text' };
    }

    if (kind === 'unknown') {
        throw Object.assign(new Error('暂不支持该文件类型，请上传 md / txt / docx / 图片 / PDF'), { status: 400 });
    }

    // 文档与图片：先传七牛（图片按需求必须走直传，服务端这里代表「中转后上传」）
    const key = `zhuopu/src/${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}/${Date.now().toString(36)}${path.extname(input.filename).toLowerCase()}`;
    let fileUrl: string | undefined;
    try {
        const up = await uploadBuffer(input.buffer, key, input.mime || 'application/octet-stream');
        fileUrl = up.url;
        recordUpload({
            userId: input.userId,
            kind: kind === 'image' ? 'image' : 'document',
            key: up.key,
            url: up.url,
            mime: input.mime,
            size: up.size
        });
    } catch (e) {
        logger.warn(`七牛上传失败，改用本地解析：${(e as Error).message}`);
    }

    // 图片必须有 URL（本地无法 OCR）——无 URL 直接报错
    if (kind === 'image' && !fileUrl) {
        throw Object.assign(new Error('图片解析需要先上传到七牛，请检查七牛配置'), { status: 502 });
    }

    const canMineru = !!env.mineru.token && mineruStatus().configured;
    let mineruError = '';

    if (canMineru) {
        try {
            // 直接上传到 MinerU 解析（不依赖我们 CDN 的对外可达性）
            const { markdown } = await uploadAndExtract(input.buffer, input.filename, {
                isOcr: kind === 'image' || kind === 'pdf'
            });
            if (markdown.trim().length > 20) {
                return {
                    text: cleanMarkdown(markdown),
                    source: 'mineru',
                    fileUrl,
                    note: kind === 'image' ? '已按图片 OCR 解析' : '已通过 MinerU 解析为 Markdown'
                };
            }
            logger.warn('MinerU 返回内容过短，改用本地解析兜底');
            mineruError = 'MinerU 返回内容过短';
        } catch (e) {
            mineruError = (e as Error).message;
            logger.warn(`MinerU 解析失败，尝试本地兜底：${mineruError}`);
        }
    }

    // 兜底：本地解析
    if (kind === 'docx') {
        const text = await docxToText(input.buffer);
        return { text, source: 'docx', fileUrl, note: '已用 docx 本地解析（未走 MinerU）' };
    }
    if (kind === 'pdf') {
        const text = await pdfToText(input.buffer);
        if (poorText(text)) {
            throw Object.assign(
                new Error('这份 PDF 看起来是扫描件，需要 OCR 才能识别；请检查 MinerU 配置或改用图片上传'),
                { status: 422 }
            );
        }
        return { text, source: 'pdf', fileUrl, note: '已用 PDF 文本层解析（未走 MinerU）' };
    }

    throw Object.assign(
        new Error(mineruError
            ? `图片需要 OCR 才能识别，MinerU 解析失败：${mineruError}`
            : '图片需要 OCR 才能识别，请先在后台配置 MinerU Token'),
        { status: 502 }
    );
}
