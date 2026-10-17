import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import { get } from '../db/index.js';

export type Role = 'user' | 'admin';
export interface JwtPayload {
    uid: number;
    role: Role;
    iat?: number;
    exp?: number;
}

declare global {
    namespace Express {
        interface Request {
            user?: { id: number; role: Role; email: string; username: string };
        }
    }
}

export const TOKEN_COOKIE = 'zp_token';

export function signToken(uid: number, role: Role, expiresIn: string = '30d'): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = { uid, role };
    const options = { expiresIn } as jwt.SignOptions;
    return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyToken(token: string): JwtPayload | null {
    try {
        return jwt.verify(token, env.jwtSecret) as JwtPayload;
    } catch {
        return null;
    }
}

function tokenFrom(req: Request): string | null {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
    const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[TOKEN_COOKIE];
    return cookie || null;
}

function loadUser(uid: number) {
    return get<{ id: number; email: string; username: string; role: Role; status: string }>(
        'SELECT id, email, username, role, status FROM users WHERE id = ?',
        uid
    );
}

/** 必须登录 */
export const requireAuth: RequestHandler = (req, res, next) => {
    const token = tokenFrom(req);
    const payload = token ? verifyToken(token) : null;
    if (!payload) return res.status(401).json({ error: '未登录或登录已过期' });
    const user = loadUser(payload.uid);
    if (!user) return res.status(401).json({ error: '账号不存在' });
    if (user.status !== 'active') return res.status(403).json({ error: '账号已被停用' });
    req.user = { id: user.id, role: user.role, email: user.email, username: user.username };
    next();
};

/** 必须管理员 */
export const requireAdmin: RequestHandler = (req, res, next) => {
    requireAuth(req, res, () => {
        if (req.user?.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
        next();
    });
};

/** 可选登录（分享页等） */
export const optionalAuth: RequestHandler = (req, _res, next) => {
    const token = tokenFrom(req);
    const payload = token ? verifyToken(token) : null;
    if (payload) {
        const user = loadUser(payload.uid);
        if (user && user.status === 'active') {
            req.user = { id: user.id, role: user.role, email: user.email, username: user.username };
        }
    }
    next();
};

/** 邮箱验证码哈希（明文只发邮件，不落库） */
export function hashCode(email: string, code: string): string {
    return crypto.createHash('sha256').update(`${email.toLowerCase()}|${code}|${env.jwtSecret}`).digest('hex');
}

export function randomCode(len = 6): string {
    return Array.from({ length: len }, () => crypto.randomInt(0, 10)).join('');
}

export function randomToken(bytes = 24): string {
    return crypto.randomBytes(bytes).toString('base64url');
}
