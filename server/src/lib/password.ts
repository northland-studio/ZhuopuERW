import crypto from 'node:crypto';

/**
 * 密码哈希：Node 内置 scrypt（scrypt$N$r$p$salt$hash），不引入额外依赖
 * 参数：N=16384, r=8, p=1, keylen=64 —— 单次约 50~80ms，足够抵抗离线爆破
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * 1024 * 1024 }, (err, key) => {
            if (err) reject(err);
            else resolve(key as Buffer);
        });
    });
}

export async function hash(password: string): Promise<string> {
    const salt = crypto.randomBytes(16);
    const key = await scrypt(password, salt);
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verify(password: string, stored: string): Promise<boolean> {
    try {
        const parts = String(stored).split('$');
        if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
        const salt = Buffer.from(parts[4], 'base64url');
        const expected = Buffer.from(parts[5], 'base64url');
        const key = await scrypt(password, salt);
        if (key.length !== expected.length) return false;
        return crypto.timingSafeEqual(key, expected);
    } catch {
        return false;
    }
}

export default { hash, verify };
