/**
 * 端到端冒烟测试：验证码登录 / 改用户名 / 设密码 / 密码登录 / 忘记密码 / 权限
 * 不依赖发信：直接按服务端算法写入一条已知验证码；另有一项单独验证真实发信。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3901';
const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const envFile = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const JWT_SECRET = /^JWT_SECRET=(.*)$/m.exec(envFile)?.[1]?.trim();
const DB_FILE = path.join(ROOT, 'server', 'data', 'zhuopu.db');

let pass = 0;
const fails = [];
function check(name, cond, extra = '') {
    if (cond) { pass++; console.log(`  OK   ${name}`); }
    else { fails.push(name); console.log(`  FAIL ${name}${extra ? ' | ' + extra : ''}`); }
}

async function api(method, p, body, token) {
    const res = await fetch(BASE + p, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch { /* 可能是空响应 */ }
    return { status: res.status, json };
}

const email = `smoke_${Date.now()}@example.com`;
const code = '654321';
const hash = crypto.createHash('sha256').update(`${email}|${code}|${JWT_SECRET}`).digest('hex');

const db = new Database(DB_FILE);
const pad = (n) => String(n).padStart(2, '0');
const d = new Date(Date.now() + 10 * 60_000);
const expiresAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
db.prepare(`INSERT INTO email_codes (email, code_hash, purpose, expires_at, ip, created_at) VALUES (?, ?, 'login', ?, '127.0.0.1', datetime('now','localtime'))`)
  .run(email, hash, expiresAt);

console.log('=== 1. 验证码登录 ===');
const login = await api('POST', '/api/auth/login', { email, code });
check('登录成功返回 200', login.status === 200, JSON.stringify(login.json));
check('首次登录自动注册', login.json?.created === true);
check('返回可用 token', typeof login.json?.token === 'string' && login.json.token.length > 20);
const token = login.json?.token;
check('默认用户名非空', !!login.json?.user?.username);
check('首个账号自动成为管理员', login.json?.user?.role === 'admin', `role=${login.json?.user?.role}`);

console.log('=== 2. 验证码错误/重复使用 ===');
const bad = await api('POST', '/api/auth/login', { email, code: '000000' });
check('错误验证码被拒', bad.status === 400, JSON.stringify(bad.json));
const reuse = await api('POST', '/api/auth/login', { email, code });
check('验证码不可重复使用', reuse.status === 400, JSON.stringify(reuse.json));

console.log('=== 3. 当前用户与改名 ===');
const me = await api('GET', '/api/auth/me', null, token);
check('获取当前用户', me.status === 200 && me.json?.user?.email === email);
const rename = await api('PATCH', '/api/auth/profile', { username: '冒烟老师' }, token);
check('改名成功', rename.status === 200 && rename.json?.user?.username === '冒烟老师', JSON.stringify(rename.json));
const renameBad = await api('PATCH', '/api/auth/profile', { username: 'a' }, token);
check('过短用户名被拒', renameBad.status === 400);

console.log('=== 4. 未登录访问被拒 ===');
const noAuth = await api('GET', '/api/auth/me');
check('无 token 返回 401', noAuth.status === 401);
const badToken = await api('GET', '/api/auth/me', null, 'not-a-token');
check('非法 token 返回 401', badToken.status === 401);

console.log('=== 5. 设置密码与密码登录 ===');
const setPwd = await api('POST', '/api/auth/password', { password: 'zhuopu12345' }, token);
check('设置密码成功', setPwd.status === 200, JSON.stringify(setPwd.json));
const weak = await api('POST', '/api/auth/password', { password: '123' }, token);
check('弱密码被拒', weak.status === 400);
const pwdLogin = await api('POST', '/api/auth/login-password', { account: email, password: 'zhuopu12345' });
check('密码登录成功', pwdLogin.status === 200 && !!pwdLogin.json?.token, JSON.stringify(pwdLogin.json));
const pwdWrong = await api('POST', '/api/auth/login-password', { account: email, password: 'wrong-password' });
check('错误密码被拒', pwdWrong.status === 400);
const pwdLoginByUsername = await api('POST', '/api/auth/login-password', { account: '冒烟老师', password: 'zhuopu12345' });
check('用用户名也能登录', pwdLoginByUsername.status === 200, JSON.stringify(pwdLoginByUsername.json));

console.log('=== 6. 忘记密码流程 ===');
const unregistered = await api('POST', '/api/auth/forgot', { email: 'nobody@example.com' });
check('未注册邮箱返回统一提示（不泄露）', unregistered.status === 200 && unregistered.json?.ok === true);
const resetToken = crypto.randomBytes(24).toString('base64url');
const resetHash = crypto.createHash('sha256').update(`${email}|${resetToken}|${JWT_SECRET}`).digest('hex');
db.prepare(`INSERT INTO email_codes (email, code_hash, purpose, expires_at, ip, created_at) VALUES (?, ?, 'reset', ?, '127.0.0.1', datetime('now','localtime'))`)
  .run(email, resetHash, expiresAt);
const reset = await api('POST', '/api/auth/reset', { email, token: resetToken, password: 'newpass12345' });
check('重置密码成功', reset.status === 200, JSON.stringify(reset.json));
const loginNewPwd = await api('POST', '/api/auth/login-password', { account: email, password: 'newpass12345' });
check('新密码可登录', loginNewPwd.status === 200);
const loginOldPwd = await api('POST', '/api/auth/login-password', { account: email, password: 'zhuopu12345' });
check('旧密码失效', loginOldPwd.status === 400);

console.log('=== 7. 发送频率与参数校验 ===');
const badEmail = await api('POST', '/api/auth/send-code', { email: 'not-an-email' });
check('非法邮箱被拒', badEmail.status === 400);

console.log('=== 8. 数据库落盘核对 ===');
const row = db.prepare('SELECT id, email, username, role, password_hash FROM users WHERE email = ?').get(email);
check('用户已入库', !!row && row.email === email);
check('密码只存哈希', typeof row?.password_hash === 'string' && row.password_hash.startsWith('scrypt$'));
check('验证码只存哈希', (() => {
    const c = db.prepare('SELECT code_hash FROM email_codes WHERE email = ? LIMIT 1').get(email);
    return c && /^[0-9a-f]{64}$/.test(c.code_hash);
})());
db.prepare('UPDATE users SET status = ? WHERE email = ?').run('disabled', email);
const disabled = await api('POST', '/api/auth/login-password', { account: email, password: 'newpass12345' });
check('停用账号无法登录', disabled.status === 403, JSON.stringify(disabled.json));

console.log(`\n=== 结果：通过 ${pass} / 失败 ${fails.length} ===`);
if (fails.length) { console.log('失败项：' + fails.join('、')); process.exitCode = 1; }
db.close();
