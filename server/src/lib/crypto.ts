import crypto from 'node:crypto';
import { env } from '../env.js';

/**
 * 设置里需要加密保存的敏感值（API Key）
 * 用 JWT_SECRET 派生密钥做 AES-256-GCM，密文格式：enc:v1:<iv>:<tag>:<data>（base64url）
 */
const PREFIX = 'enc:v1:';

function key(): Buffer {
    return crypto.createHash('sha256').update(`zhuopu-settings|${env.jwtSecret}`).digest();
}

export function encrypt(plain: string): string {
    if (!plain) return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + [iv, tag, data].map((b) => b.toString('base64url')).join(':');
}

export function decrypt(stored: string): string {
    if (!stored) return '';
    if (!stored.startsWith(PREFIX)) return stored; // 兼容明文（首次迁移前写入的值）
    try {
        const [ivB, tagB, dataB] = stored.slice(PREFIX.length).split(':');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB!, 'base64url'));
        decipher.setAuthTag(Buffer.from(tagB!, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(dataB!, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
        return '';
    }
}

export function maskSecret(value: string): string {
    if (!value) return '';
    if (value.length <= 8) return '****';
    return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
