/** 生成一个可用的登录 token（写 data/_token.txt），仅用于本地 UI 联调 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const envFile = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const secret = /^JWT_SECRET=(.*)$/m.exec(envFile)?.[1]?.trim();
const DB_FILE = path.join(ROOT, 'server', 'data', 'zhuopu.db');

const email = 'material-test@example.com';
const code = '778899';
const hash = crypto.createHash('sha256').update(`${email}|${code}|${secret}`).digest('hex');
const db = new Database(DB_FILE);
const p = (n) => String(n).padStart(2, '0');
const d = new Date(Date.now() + 1_800_000);
const at = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
db.prepare(
    "INSERT INTO email_codes (email, code_hash, purpose, expires_at, ip, created_at) VALUES (?, ?, 'login', ?, '127.0.0.1', datetime('now','localtime'))"
).run(email, hash, at);
db.close();

const res = await fetch('http://127.0.0.1:3901/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
}).then((r) => r.json());

if (!res.token) {
    console.log('登录失败：', res);
    process.exit(1);
}
fs.writeFileSync(path.join(ROOT, 'server', 'data', '_token.txt'), res.token);
console.log('token 已写入 server/data/_token.txt（用户 ' + res.user.username + '，role=' + res.user.role + '）');
