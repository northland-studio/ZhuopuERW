/**
 * 七牛上传（零依赖）
 *
 * 用法：
 *   node scripts/upload-qiniu.mjs <本地文件> <oss key> [--bucket=zhuopu]
 * 环境变量：
 *   QINIU_ACCESS_KEY / QINIU_SECRET_KEY / QINIU_UPLOAD_URL（默认 https://up-as0.qiniup.com）/ QINIU_BUCKET
 *
 * CI 里从 GitHub Secrets 注入，本地从 xuanjian.top 的 .env 读，不写进仓库。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
    args.filter((a) => a.startsWith('--')).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? 'true'];
    })
);

const [localFile, key] = positional;
if (!localFile || !key) {
    console.error('用法: node scripts/upload-qiniu.mjs <本地文件> <oss key>');
    process.exit(1);
}

const AK = process.env.QINIU_ACCESS_KEY;
const SK = process.env.QINIU_SECRET_KEY;
const BUCKET = flags.bucket || process.env.QINIU_BUCKET || 'zhuopu';
const UPLOAD_URL = process.env.QINIU_UPLOAD_URL || 'https://up-as0.qiniup.com';
const DOMAIN = (process.env.QINIU_DOMAIN || 'https://cdn.zp.xuanjian.top').replace(/\/+$/, '');

if (!AK || !SK) {
    console.error('缺少 QINIU_ACCESS_KEY / QINIU_SECRET_KEY');
    process.exit(1);
}

function base64url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function uploadToken(scope) {
    const putPolicy = JSON.stringify({
        scope,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        insertOnly: 0
    });
    const encoded = base64url(Buffer.from(putPolicy, 'utf8'));
    const sign = base64url(crypto.createHmac('sha1', SK).update(encoded).digest());
    return `${AK}:${sign}:${encoded}`;
}

const fileBuf = fs.readFileSync(localFile);
const ext = path.extname(localFile).toLowerCase();
const mime = ext === '.exe' ? 'application/vnd.microsoft.portable-executable'
    : ext === '.json' ? 'application/json'
        : ext === '.png' ? 'image/png'
            : 'application/octet-stream';

const token = uploadToken(`${BUCKET}:${key}`);
const form = new FormData();
form.append('token', token);
form.append('key', key);
form.append('file', new Blob([fileBuf], { type: mime }), path.basename(localFile));

const res = await fetch(UPLOAD_URL, { method: 'POST', body: form });
const text = await res.text();
if (!res.ok) {
    console.error(`上传失败 HTTP ${res.status}: ${text.slice(0, 300)}`);
    process.exit(1);
}

console.log(`已上传 ${path.basename(localFile)}（${(fileBuf.length / 1024 / 1024).toFixed(2)} MB）`);
console.log(`直链: ${DOMAIN}/${encodeURI(key)}`);
