import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { ingestFile } from '../services/ingest.js';
import { objectKey, publicUrl, qiniuStatus, recordUpload, uploadToken } from '../services/qiniu.js';
import { mineruStatus } from '../services/mineru.js';
import { logger } from '../logger.js';

export const uploadRouter = Router();

/** 内存存储：文件立即转七牛，不落本地磁盘 */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 40 * 1024 * 1024 }
});

/** 浏览器直传凭证：图片不经过源站 */
uploadRouter.post('/token', requireAuth, (req, res) => {
    const parsed = z
        .object({
            filename: z.string().min(1),
            kind: z.enum(['image', 'document']).default('image')
        })
        .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '请提供文件名' });

    const key = objectKey(parsed.data.filename, parsed.data.kind === 'image' ? 'zhuopu/img' : 'zhuopu/doc');
    const token = uploadToken(key);
    res.json({
        ...token,
        host: token.host,
        // 七牛表单上传字段名固定为 token / key / file
        formField: { token: 'token', key: 'key', file: 'file' }
    });
});

/** 直传完成后的登记（客户端拿到 key/url 后回填） */
uploadRouter.post('/confirm', requireAuth, (req, res) => {
    const parsed = z
        .object({
            key: z.string().min(1),
            url: z.string().url().optional(),
            kind: z.enum(['image', 'document']).default('image'),
            mime: z.string().default(''),
            size: z.number().int().nonnegative().default(0)
        })
        .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '参数不完整' });
    const { key, kind, mime, size } = parsed.data;
    const url = parsed.data.url || publicUrl(key);
    recordUpload({ userId: req.user!.id, kind, key, url, mime, size });
    res.json({ ok: true, url });
});

/** 服务端中转上传 + 解析：docx / pdf / 图片 一次性拿到文字 */
uploadRouter.post('/file', requireAuth, upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请选择文件' });
        const filename = req.file.originalname || 'upload';
        const mime = req.file.mimetype || '';
        const ext = path.extname(filename).toLowerCase();
        const allowed = ['.md', '.markdown', '.txt', '.text', '.docx', '.doc', '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.jp2'];
        if (!allowed.includes(ext)) {
            return res.status(400).json({ error: `不支持的文件类型 ${ext || '(无扩展名)'}，请上传 md / txt / docx / 图片 / PDF` });
        }

        const result = await ingestFile({
            buffer: req.file.buffer,
            filename,
            mime,
            userId: req.user!.id
        });
        res.json({
            ok: true,
            filename,
            source: result.source,
            text: result.text,
            length: result.text.length,
            fileUrl: result.fileUrl ?? null,
            note: result.note ?? ''
        });
    } catch (e) {
        next(e);
    }
});

/** 通道状态（前端提示用） */
uploadRouter.get('/status', requireAuth, (_req, res) => {
    res.json({
        qiniu: qiniuStatus(),
        mineru: mineruStatus()
    });
});

uploadRouter.use((err: Error, _req: unknown, res: import('express').Response, next: import('express').NextFunction) => {
    if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? '文件超过 40MB 限制' : `上传失败：${err.message}`;
        return res.status(413).json({ error: msg });
    }
    logger.error('上传处理异常：', err);
    next(err);
});
