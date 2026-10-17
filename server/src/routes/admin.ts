import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { all, get, now, run } from '../db/index.js';
import { encrypt, maskSecret, decrypt } from '../lib/crypto.js';
import { providerStatus, type Provider } from '../services/llm/index.js';
import { mailState, verifyMail } from '../services/mail.js';
import { qiniuStatus } from '../services/qiniu.js';
import { mineruStatus } from '../services/mineru.js';
import { env } from '../env.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

/* ---------------- 概览 ---------------- */

adminRouter.get('/overview', (_req, res) => {
    const users = get<{ c: number }>('SELECT COUNT(*) AS c FROM users')?.c ?? 0;
    const sets = get<{ c: number }>('SELECT COUNT(*) AS c FROM review_sets WHERE deleted_at IS NULL')?.c ?? 0;
    const questions = get<{ c: number }>('SELECT COUNT(*) AS c FROM questions')?.c ?? 0;
    const analyzed = get<{ c: number }>('SELECT COUNT(*) AS c FROM questions WHERE analyzed_at IS NOT NULL')?.c ?? 0;
    const tokensToday = get<{ s: number }>(
        `SELECT COALESCE(SUM(total_tokens),0) AS s FROM llm_usage WHERE created_at >= date('now','localtime')`
    )?.s ?? 0;
    const tokens7d = get<{ s: number }>(
        `SELECT COALESCE(SUM(total_tokens),0) AS s FROM llm_usage WHERE created_at >= datetime('now','localtime','-7 days')`
    )?.s ?? 0;
    const tokensAll = get<{ s: number }>('SELECT COALESCE(SUM(total_tokens),0) AS s FROM llm_usage')?.s ?? 0;
    const calls = get<{ c: number }>('SELECT COUNT(*) AS c FROM llm_usage')?.c ?? 0;
    const failed = get<{ c: number }>('SELECT COUNT(*) AS c FROM llm_usage WHERE ok = 0')?.c ?? 0;
    res.json({
        users, sets, questions, analyzed,
        tokens: { today: tokensToday, last7d: tokens7d, total: tokensAll },
        calls, failed,
        providers: providerStatus(),
        mail: mailState(),
        qiniu: qiniuStatus(),
        mineru: mineruStatus(),
        siteUrl: env.siteUrl
    });
});

/* ---------------- token 吞吐统计 ---------------- */

adminRouter.get('/usage', (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days ?? 14)));
    const daily = all<{ day: string; calls: number; prompt: number; completion: number; total: number }>(
        `SELECT date(created_at) AS day,
                COUNT(*) AS calls,
                COALESCE(SUM(prompt_tokens),0) AS prompt,
                COALESCE(SUM(completion_tokens),0) AS completion,
                COALESCE(SUM(total_tokens),0) AS total
           FROM llm_usage
          WHERE created_at >= datetime('now','localtime', ?)
          GROUP BY day ORDER BY day DESC`,
        `-${days} days`
    ).reverse();

    const byModel = all<{ provider: string; model: string; calls: number; total: number }>(
        `SELECT provider, model, COUNT(*) AS calls, COALESCE(SUM(total_tokens),0) AS total
           FROM llm_usage
          WHERE created_at >= datetime('now','localtime','-30 days')
          GROUP BY provider, model ORDER BY total DESC`
    );

    const byPurpose = all<{ purpose: string; calls: number; total: number }>(
        `SELECT purpose, COUNT(*) AS calls, COALESCE(SUM(total_tokens),0) AS total
           FROM llm_usage
          WHERE created_at >= datetime('now','localtime','-30 days')
          GROUP BY purpose ORDER BY total DESC`
    );

    const topUsers = all<{ user_id: number; username: string; email: string; calls: number; total: number }>(
        `SELECT u.id AS user_id, u.username, u.email, COUNT(*) AS calls, COALESCE(SUM(l.total_tokens),0) AS total
           FROM llm_usage l LEFT JOIN users u ON u.id = l.user_id
          WHERE l.created_at >= datetime('now','localtime','-30 days')
          GROUP BY l.user_id ORDER BY total DESC LIMIT 10`
    );

    const recentErrors = all<{ created_at: string; provider: string; model: string; error: string }>(
        `SELECT created_at, provider, model, error FROM llm_usage WHERE ok = 0 ORDER BY id DESC LIMIT 10`
    );

    res.json({ days, daily, byModel, byPurpose, topUsers, recentErrors });
});

/* ---------------- 设置：模型 / API Key ---------------- */

const PUBLIC_SETTING_KEYS = [
    'llm.defaultProvider',
    'llm.deepseek.model',
    'llm.glm.model',
    'feature.cloudSave',
    'feature.share',
    'feature.activationRequired'
];

adminRouter.get('/settings', (_req, res) => {
    const rows = all<{ key: string; value: string; updated_at: string }>('SELECT key, value, updated_at FROM settings');
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    // 敏感值只回显掩码
    const secrets = {
        deepseekKey: maskSecret(decrypt(map['llm.deepseek.apiKey'] || '') || env.llm.deepseek.apiKey),
        glmKey: maskSecret(decrypt(map['llm.glm.apiKey'] || '') || env.llm.glm.apiKey)
    };
    const publicValues: Record<string, string> = {};
    for (const k of PUBLIC_SETTING_KEYS) publicValues[k] = map[k] ?? '';
    res.json({ settings: publicValues, secrets, providers: providerStatus() });
});

adminRouter.put('/settings', (req, res) => {
    const parsed = z
        .object({
            'llm.defaultProvider': z.enum(['deepseek', 'glm']).optional(),
            'llm.deepseek.model': z.string().max(60).optional(),
            'llm.glm.model': z.string().max(60).optional(),
            'feature.cloudSave': z.enum(['true', 'false']).optional(),
            'feature.share': z.enum(['true', 'false']).optional(),
            'feature.activationRequired': z.enum(['true', 'false']).optional(),
            deepseekKey: z.string().max(200).optional(),
            glmKey: z.string().max(200).optional()
        })
        .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '参数不正确' });

    const body = parsed.data;
    const writes: [string, string][] = [];
    for (const k of PUBLIC_SETTING_KEYS) {
        const v = (body as Record<string, unknown>)[k];
        if (typeof v === 'string' && v) writes.push([k, v]);
    }
    if (body.deepseekKey) writes.push(['llm.deepseek.apiKey', encrypt(body.deepseekKey.trim())]);
    if (body.glmKey) writes.push(['llm.glm.apiKey', encrypt(body.glmKey.trim())]);

    for (const [k, v] of writes) {
        run(
            `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            k, v, now()
        );
    }
    res.json({ ok: true, updated: writes.length });
});

/* ---------------- 模型连通性自检 ---------------- */

adminRouter.post('/settings/test-provider', async (req, res, next) => {
    try {
        const provider = (req.body?.provider === 'glm' ? 'glm' : 'deepseek') as Provider;
        const { chatJson } = await import('../services/llm/index.js');
        const r = await chatJson({
            system: '你是测试助手，只输出 JSON。',
            user: '输出 {"ok":true,"msg":"连接正常"}',
            provider,
            maxTokens: 50,
            purpose: 'selftest'
        });
        res.json({ ok: true, provider, model: r.model, latencyMs: r.latencyMs, usage: r.usage, sample: r.data });
    } catch (e) {
        next(e);
    }
});

/* ---------------- 邮件自检 ---------------- */

adminRouter.post('/mail/test', async (_req, res) => {
    const r = await verifyMail();
    res.json({ ...r, state: mailState() });
});

/* ---------------- 激活码（预留） ---------------- */

adminRouter.get('/activation-codes', (req, res) => {
    const batch = String(req.query.batch ?? '');
    const rows = batch
        ? all('SELECT * FROM activation_codes WHERE batch = ? ORDER BY id DESC LIMIT 500', batch)
        : all('SELECT * FROM activation_codes ORDER BY id DESC LIMIT 500');
    res.json({ codes: rows });
});

adminRouter.post('/activation-codes', (req, res) => {
    const parsed = z
        .object({
            count: z.number().int().min(1).max(200).default(10),
            batch: z.string().max(40).default(''),
            note: z.string().max(200).default(''),
            expiresInDays: z.number().int().min(0).max(3650).default(0)
        })
        .safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: '参数不正确' });

    const batch = parsed.data.batch || `B${Date.now().toString(36).toUpperCase()}`;
    const codes: string[] = [];
    const alphabet = 'ACDEFGHJKLMNPQRTUVWXY34679';
    for (let i = 0; i < parsed.data.count; i++) {
        let code = '';
        for (let j = 0; j < 12; j++) code += alphabet[crypto.randomInt(0, alphabet.length)];
        const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
        codes.push(formatted);
        const expires = parsed.data.expiresInDays
            ? new Date(Date.now() + parsed.data.expiresInDays * 86400_000)
            : null;
        const p = (n: number) => String(n).padStart(2, '0');
        const expiresAt = expires
            ? `${expires.getFullYear()}-${p(expires.getMonth() + 1)}-${p(expires.getDate())} 23:59:59`
            : null;
        run(
            'INSERT INTO activation_codes (code, batch, note, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
            formatted, batch, parsed.data.note, expiresAt, now()
        );
    }
    res.status(201).json({ ok: true, batch, codes });
});

/* ---------------- 用户管理（只读） ---------------- */

adminRouter.get('/users', (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const rows = all<{ id: number; email: string; username: string; role: string; status: string; created_at: string; last_login_at: string | null; sets: number }>(
        `SELECT u.id, u.email, u.username, u.role, u.status, u.created_at, u.last_login_at,
                (SELECT COUNT(*) FROM review_sets r WHERE r.user_id = u.id AND r.deleted_at IS NULL) AS sets
           FROM users u
          ${q ? 'WHERE u.email LIKE ? OR u.username LIKE ?' : ''}
          ORDER BY u.id DESC LIMIT 200`,
        ...(q ? [`%${q}%`, `%${q}%`] : [])
    );
    res.json({ users: rows });
});

adminRouter.patch('/users/:id', (req, res) => {
    const parsed = z
        .object({
            status: z.enum(['active', 'disabled']).optional(),
            role: z.enum(['user', 'admin']).optional()
        })
        .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '参数不正确' });
    if (Number(req.params.id) === req.user!.id && parsed.data.role === 'user') {
        return res.status(400).json({ error: '不能把自己降级为普通用户' });
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    if (parsed.data.status) { sets.push('status = ?'); params.push(parsed.data.status); }
    if (parsed.data.role) { sets.push('role = ?'); params.push(parsed.data.role); }
    if (!sets.length) return res.status(400).json({ error: '没有要修改的字段' });
    sets.push('updated_at = ?'); params.push(now(), Number(req.params.id));
    run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ ok: true });
});
