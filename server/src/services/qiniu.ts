import crypto from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import qiniu from 'qiniu';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { get, now, run } from '../db/index.js';

/** 七牛（公开空间 zhuopu，新加坡区 as0） */
export const QINIU_UPLOAD_HOST = 'https://upload-as0.qiniup.com';

function mac() {
    if (!env.qiniu.accessKey || !env.qiniu.secretKey) {
        throw Object.assign(new Error('七牛 AccessKey/SecretKey 未配置'), { status: 500 });
    }
    return new qiniu.auth.digest.Mac(env.qiniu.accessKey, env.qiniu.secretKey);
}

/** 生成对象键：zhuopu/<yyyymm>/<随机>.<ext> */
export function objectKey(originalName: string, prefix = 'zhuopu'): string {
    const ext = (path.extname(originalName) || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
    const d = new Date();
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${prefix}/${ym}/${crypto.randomBytes(10).toString('hex')}${ext}`;
}

export function publicUrl(key: string): string {
    return `${env.qiniu.domain}/${key}`;
}

/** 浏览器直传凭证（图片走这条，不经过源站） */
export function uploadToken(key: string, ttlSeconds = env.qiniu.tokenTtl): { token: string; host: string; key: string; url: string; expiresIn: number } {
    const policy = new qiniu.rs.PutPolicy({
        scope: `${env.qiniu.bucket}:${key}`,
        expires: Math.floor(Date.now() / 1000) + ttlSeconds,
        returnBody: JSON.stringify({ key: '$(key)', hash: '$(etag)', fsize: '$(fsize)', mimeType: '$(mimeType)' })
    });
    return {
        token: policy.uploadToken(mac()),
        host: QINIU_UPLOAD_HOST,
        key,
        url: publicUrl(key),
        expiresIn: ttlSeconds
    };
}

/** 服务端上传（docx/pdf 等必须中转的文件） */
export async function uploadBuffer(
    buffer: Buffer,
    key: string,
    mime: string
): Promise<{ key: string; url: string; size: number }> {
    const config = new qiniu.conf.Config({ zone: qiniu.zone.Zone_as0 });
    const uploader = new qiniu.form_up.FormUploader(config);
    const putExtra = new qiniu.form_up.PutExtra();
    putExtra.mimeType = mime;

    const token = uploadToken(key, 3600).token;
    const stream = Readable.from(buffer);

    const result = await new Promise<{ hash?: string }>((resolve, reject) => {
        uploader.putStream(token, key, stream, putExtra, (err, body, info) => {
            if (err) return reject(Object.assign(new Error(`七牛上传失败：${err.message}`), { status: 502 }));
            if (info.statusCode !== 200) return reject(Object.assign(new Error(`七牛上传失败：HTTP ${info.statusCode} ${JSON.stringify(body)}`), { status: 502 }));
            resolve(body as { hash?: string });
        });
    });

    const url = publicUrl(key);
    logger.info(`七牛上传成功：${key}（${buffer.length} 字节）hash=${result.hash ?? '-'}`);
    return { key, url, size: buffer.length };
}

/** 记录一次上传（便于后台追踪与清理） */
export function recordUpload(input: {
    userId?: number | null;
    kind: 'image' | 'document';
    key: string;
    url: string;
    mime: string;
    size: number;
}): number {
    const r = run(
        `INSERT INTO uploads (user_id, kind, object_key, url, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        input.userId ?? null, input.kind, input.key, input.url, input.mime, input.size, now()
    );
    return r.lastInsertRowid;
}

/** 健康检查：域名与空间配置是否就绪 */
export function qiniuStatus() {
    return {
        bucket: env.qiniu.bucket,
        region: env.qiniu.region,
        domain: env.qiniu.domain,
        configured: !!(env.qiniu.accessKey && env.qiniu.secretKey),
        uploadHost: QINIU_UPLOAD_HOST
    };
}

export function recentUploads(userId: number, limit = 20) {
    return get<{ c: number }>('SELECT COUNT(*) AS c FROM uploads WHERE user_id = ?', userId)?.c ?? 0;
}
