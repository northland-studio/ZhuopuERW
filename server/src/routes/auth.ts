import crypto from 'node:crypto';
import { Router } from 'express';
import bcryptLike from '../lib/password.js';
import { z } from 'zod';
import { all, get, now, run } from '../db/index.js';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { hashCode, randomCode, randomToken, requireAuth, signToken, TOKEN_COOKIE, verifyToken } from '../middleware/auth.js';
import { sendCodeMail, sendResetMail } from '../services/mail.js';

export const authRouter = Router();

const emailSchema = z.string().trim().toLowerCase().email({ message: '邮箱格式不正确' });
const passwordSchema = z.string().min(8, '密码至少 8 位').max(64, '密码过长');
const usernameSchema = z
    .string()
    .trim()
    .refine((v) => [...v].length >= 2, '用户名至少 2 个字符')
    .refine((v) => [...v].length <= 20, '用户名最多 20 个字符')
    // 允许中文（含扩展区）、字母、数字、空格、下划线、连字符、点、间隔号等；
    // 只拦掉会破坏 URL / 路径 / 展示的字符
    .refine((v) => !/[/\\@<>:"|?*\u0000-\u001f\u007f]/.test(v), '用户名不能包含 / \\ @ < > : " | ? * 等符号');

function clientIp(req: { headers: Record<string, unknown>; ip?: string }): string {
    const xf = req.headers['x-forwarded-for'];
    const first = Array.isArray(xf) ? xf[0] : typeof xf === 'string' ? xf.split(',')[0] : '';
    return (first || req.ip || '').replace(/^::ffff:/, '').trim();
}

function setTokenCookie(res: import('express').Response, token: string) {
    res.cookie(TOKEN_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.isProd,
        maxAge: 30 * 24 * 3600 * 1000,
        path: '/'
    });
}

function defaultUsername(email: string): string {
    const base = email.split('@')[0].replace(/[^\w\u4e00-\u9fa5-]/g, '').slice(0, 14) || 'teacher';
    let name = base;
    for (let i = 0; i < 50; i++) {
        const dup = get('SELECT id FROM users WHERE username = ?', name);
        if (!dup) return name;
        name = `${base}${i + 2}`;
    }
    return `${base}${crypto.randomInt(1000, 9999)}`;
}

function publicUser(u: { id: number; email: string; username: string; role: string; password_hash?: string | null }) {
    return {
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.role,
        hasPassword: !!u.password_hash
    };
}

/* ============ 发送验证码 ============ */
authRouter.post('/send-code', async (req, res) => {
    const parsed = z
        .object({ email: emailSchema, purpose: z.enum(['login', 'reset', 'verify']).default('login') })
        .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '参数错误' });
    const { email, purpose } = parsed.data;
    const ip = clientIp(req as never);

    // 频率限制：同邮箱 60 秒内只能发一次；同邮箱/同 IP 每小时上限
    const recent = get<{ id: number }>(
        `SELECT id FROM email_codes WHERE email = ? AND purpose = ? AND created_at > datetime('now','localtime', ?)`,
        email, purpose, `-${env.code.resendSeconds} seconds`
    );
    if (recent) return res.status(429).json({ error: `请等待 ${env.code.resendSeconds} 秒后再发送` });

    const perEmail = get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM email_codes WHERE email = ? AND created_at > datetime('now','localtime','-1 hour')`, email
    )?.c ?? 0;
    if (perEmail >= env.code.maxPerEmailPerHour) return res.status(429).json({ error: '该邮箱今日验证码发送过多，请稍后再试' });

    const perIp = get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM email_codes WHERE ip = ? AND created_at > datetime('now','localtime','-1 hour')`, ip
    )?.c ?? 0;
    if (perIp >= env.code.maxPerIpPerHour) return res.status(429).json({ error: '当前网络请求过于频繁，请稍后再试' });

    const code = randomCode(6);
    const expires = new Date(Date.now() + env.code.ttlMinutes * 60_000);
    const p = (n: number) => String(n).padStart(2, '0');
    const expiresAt = `${expires.getFullYear()}-${p(expires.getMonth() + 1)}-${p(expires.getDate())} ${p(expires.getHours())}:${p(expires.getMinutes())}:${p(expires.getSeconds())}`;

    run(
        `INSERT INTO email_codes (email, code_hash, purpose, expires_at, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        email, hashCode(email, code), purpose, expiresAt, ip, now()
    );

    try {
        await sendCodeMail(email, code, purpose === 'reset' ? 'reset' : 'login', env.code.ttlMinutes);
    } catch (e) {
        logger.error('验证码邮件发送失败：', e);
        return res.status(502).json({ error: '邮件发送失败，请稍后重试或联系管理员' });
    }
    res.json({ ok: true, message: '验证码已发送', ttlMinutes: env.code.ttlMinutes });
});

/* ============ 校验验证码（内部） ============ */
function consumeCode(email: string, code: string, purpose: 'login' | 'reset'): { ok: true } | { ok: false; error: string } {
    const row = get<{ id: number; code_hash: string; attempts: number; expires_at: string; used_at: string | null }>(
        `SELECT * FROM email_codes WHERE email = ? AND purpose = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1`,
        email, purpose
    );
    if (!row) return { ok: false, error: '请先获取验证码' };
    if (row.used_at) return { ok: false, error: '验证码已被使用，请重新获取' };
    if (row.expires_at < now()) return { ok: false, error: '验证码已过期，请重新获取' };
    if (row.attempts >= 5) return { ok: false, error: '验证码尝试次数过多，请重新获取' };
    if (row.code_hash !== hashCode(email, code)) {
        run('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?', row.id);
        return { ok: false, error: '验证码不正确' };
    }
    run('UPDATE email_codes SET used_at = ? WHERE id = ?', now(), row.id);
    return { ok: true };
}

/* ============ 验证码登录（首次即注册） ============ */
authRouter.post('/login', (req, res) => {
    const parsed = z.object({ email: emailSchema, code: z.string().trim().min(4).max(10) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '参数错误' });
    const { email, code } = parsed.data;

    const checked = consumeCode(email, code, 'login');
    if (!checked.ok) return res.status(400).json({ error: checked.error });

    let user = get<{ id: number; email: string; username: string; role: string; status: string; password_hash: string | null }>(
        'SELECT id, email, username, role, status, password_hash FROM users WHERE email = ?', email
    );
    if (user && user.status !== 'active') return res.status(403).json({ error: '账号已被停用，请联系管理员' });

    let created = false;
    if (!user) {
        // 管理员归属：优先用 ADMIN_EMAIL 指定；未配置时，第一个注册的账号自动成为管理员
        const hasAdmin = get<{ id: number }>(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
        const role = env.adminEmail
            ? (email === env.adminEmail ? 'admin' : 'user')
            : (hasAdmin ? 'user' : 'admin');
        const r = run(
            `INSERT INTO users (email, username, role, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)`,
            email, defaultUsername(email), role, now(), now(), now()
        );
        user = get('SELECT id, email, username, role, status, password_hash FROM users WHERE id = ?', r.lastInsertRowid)!;
        created = true;
        logger.info(`新用户注册：${email}（${user.username}，role=${user.role}）`);
    } else {
        run('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', now(), now(), user.id);
    }

    const token = signToken(user.id, user.role as 'user' | 'admin');
    setTokenCookie(res, token);
    res.json({ ok: true, created, token, user: publicUser(user) });
});

/* ============ 密码登录（设置了密码后才可用） ============ */
authRouter.post('/login-password', async (req, res) => {
    const parsed = z
        .object({ account: z.string().trim().min(3), password: z.string().min(1).max(64) })
        .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '请输入账号与密码' });
    const { account, password } = parsed.data;
    const isEmail = account.includes('@');
    const user = get<{ id: number; email: string; username: string; role: string; status: string; password_hash: string | null }>(
        `SELECT id, email, username, role, status, password_hash FROM users WHERE ${isEmail ? 'email' : 'username'} = ?`,
        isEmail ? account.toLowerCase() : account
    );
    if (!user) return res.status(400).json({ error: '账号或密码不正确' });
    if (user.status !== 'active') return res.status(403).json({ error: '账号已被停用，请联系管理员' });
    if (!user.password_hash) return res.status(400).json({ error: '该账号还没有设置密码，请先用邮箱验证码登录' });
    const ok = await bcryptLike.verify(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: '账号或密码不正确' });

    run('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', now(), now(), user.id);
    const token = signToken(user.id, user.role as 'user' | 'admin');
    setTokenCookie(res, token);
    res.json({ ok: true, token, user: publicUser(user) });
});

/* ============ 设置/修改密码（已登录） ============ */
authRouter.post('/password', requireAuth, async (req, res) => {
    const parsed = z.object({ password: passwordSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '密码不符合要求' });
    const hash = await bcryptLike.hash(parsed.data.password);
    run('UPDATE users SET password_hash = ?, password_set_at = ?, updated_at = ? WHERE id = ?',
        hash, now(), now(), req.user!.id);
    res.json({ ok: true, message: '密码已更新' });
});

/* ============ 忘记密码：发重置邮件（链接 + 验证码双通道） ============ */
authRouter.post('/forgot', async (req, res) => {
    const parsed = z.object({ email: emailSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '邮箱格式不正确' });
    const email = parsed.data.email;
    const ip = clientIp(req as never);
    const user = get<{ id: number }>('SELECT id FROM users WHERE email = ?', email);
    // 不暴露邮箱是否注册：无论是否存在都返回同一提示
    const generic = { ok: true, message: '如果该邮箱已注册，重置邮件已发送' };
    if (!user) return res.json(generic);

    const recent = get<{ id: number }>(
        `SELECT id FROM email_codes WHERE email = ? AND purpose = 'reset' AND created_at > datetime('now','localtime', ?)`,
        email, `-${env.code.resendSeconds} seconds`
    );
    if (recent) return res.status(429).json({ error: `请等待 ${env.code.resendSeconds} 秒后再试` });

    const rawToken = randomToken(24);
    const expires = new Date(Date.now() + env.code.ttlMinutes * 60_000);
    const p = (n: number) => String(n).padStart(2, '0');
    const expiresAt = `${expires.getFullYear()}-${p(expires.getMonth() + 1)}-${p(expires.getDate())} ${p(expires.getHours())}:${p(expires.getMinutes())}:${p(expires.getSeconds())}`;
    run(
        `INSERT INTO email_codes (email, code_hash, purpose, expires_at, ip, created_at) VALUES (?, ?, 'reset', ?, ?, ?)`,
        email, hashCode(email, rawToken), expiresAt, ip, now()
    );
    const link = `${env.siteUrl}/reset?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}`;
    try {
        await sendResetMail(email, link, env.code.ttlMinutes);
    } catch {
        return res.status(502).json({ error: '邮件发送失败，请稍后重试或联系管理员' });
    }
    res.json(generic);
});

/* ============ 重置密码（用邮件里的 token） ============ */
authRouter.post('/reset', async (req, res) => {
    const parsed = z
        .object({ email: emailSchema, token: z.string().trim().min(10), password: passwordSchema })
        .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '参数错误' });
    const { email, token, password } = parsed.data;

    const checked = consumeCode(email, token, 'reset');
    if (!checked.ok) return res.status(400).json({ error: checked.error });

    const user = get<{ id: number }>('SELECT id FROM users WHERE email = ?', email);
    if (!user) return res.status(400).json({ error: '账号不存在' });
    const hash = await bcryptLike.hash(password);
    run('UPDATE users SET password_hash = ?, password_set_at = ?, updated_at = ? WHERE id = ?', hash, now(), now(), user.id);
    res.json({ ok: true, message: '密码已重置，请使用新密码登录' });
});

/* ============ 当前用户 ============ */
authRouter.get('/me', requireAuth, (req, res) => {
    const u = get<{ id: number; email: string; username: string; role: string; password_hash: string | null; created_at: string }>(
        'SELECT id, email, username, role, password_hash, created_at FROM users WHERE id = ?', req.user!.id
    );
    if (!u) return res.status(404).json({ error: '账号不存在' });
    res.json({ user: publicUser(u), createdAt: u.created_at });
});

/* ============ 修改用户名 ============ */
authRouter.patch('/profile', requireAuth, (req, res) => {
    const parsed = z.object({ username: usernameSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '用户名不符合要求' });
    const username = parsed.data.username;
    const dup = get<{ id: number }>('SELECT id FROM users WHERE username = ? AND id <> ?', username, req.user!.id);
    if (dup) return res.status(409).json({ error: '该用户名已被使用' });
    run('UPDATE users SET username = ?, updated_at = ? WHERE id = ?', username, now(), req.user!.id);
    const u = get<{ id: number; email: string; username: string; role: string; password_hash: string | null }>(
        'SELECT id, email, username, role, password_hash FROM users WHERE id = ?', req.user!.id
    )!;
    res.json({ ok: true, user: publicUser(u) });
});

/* ============ 退出登录 ============ */
authRouter.post('/logout', (req, res) => {
    res.clearCookie(TOKEN_COOKIE, { path: '/' });
    res.json({ ok: true });
});

/** 供其它模块复用的校验器（分享链接、后台等） */
export function verifyResetToken(email: string, token: string): boolean {
    const payload = verifyToken(token);
    return !!payload || !!get('SELECT id FROM email_codes WHERE email = ? AND code_hash = ?', email, hashCode(email, token));
}

export function countCodesToday(email: string): number {
    return (
        get<{ c: number }>(
            `SELECT COUNT(*) AS c FROM email_codes WHERE email = ? AND created_at > datetime('now','localtime','-1 day')`,
            email
        )?.c ?? 0
    );
}

export function listRecentCodes(email: string, limit = 5) {
    return all(`SELECT purpose, created_at, used_at FROM email_codes WHERE email = ? ORDER BY id DESC LIMIT ?`, email, limit);
}
