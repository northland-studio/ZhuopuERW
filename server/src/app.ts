import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './env.js';
import { logger } from './logger.js';
import { authRouter } from './routes/auth.js';
import { uploadRouter } from './routes/upload.js';
import { reviewsRouter, shareRouter } from './routes/reviews.js';
import { adminRouter } from './routes/admin.js';

export function createApp() {
    const app = express();

    app.disable('x-powered-by');
    app.set('trust proxy', 1);
    app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
    app.use(express.json({ limit: '4mb' }));
    app.use(express.urlencoded({ extended: true, limit: '4mb' }));
    app.use(cookieParser());

    /**
     * Tauri 桌面端跨域：它的页面来自 tauri://localhost（Windows 下是 http://tauri.localhost），
     * 与线上域名不同源，必须放行这几个来源，否则登录/讲评请求全部失败。
     * 只允许这三个固定来源，不用通配符（含凭证时通配符本身也不被浏览器接受）。
     */
    const TAURI_ORIGINS = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']);
    app.use('/api/', (req, res, next) => {
        const origin = req.headers.origin;
        if (typeof origin === 'string' && TAURI_ORIGINS.has(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Max-Age', '600');
        }
        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return;
        }
        next();
    });

    // 全局限流：只拦 API，避免影响静态资源
    app.use(
        '/api/',
        rateLimit({
            windowMs: 60_000,
            limit: 240,
            standardHeaders: 'draft-7',
            legacyHeaders: false,
            message: { error: '请求过于频繁，请稍后再试' }
        })
    );

    // 访问日志（生产由 pm2 收集）
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const ms = Date.now() - start;
            const log = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`;
            if (res.statusCode >= 500) logger.error(log);
            else logger.info(log);
        });
        next();
    });

    app.get('/api/health', (_req, res) => {
        res.json({ ok: true, name: '琢璞英语讲评工作台', time: new Date().toISOString(), env: env.nodeEnv });
    });

    app.use('/api/auth', authRouter);
    app.use('/api/upload', uploadRouter);
    app.use('/api/reviews', reviewsRouter);
    app.use('/api/share', shareRouter);
    app.use('/api/admin', adminRouter);

    // 404（API）
    app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));

    // 统一错误处理
    app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
        const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
        if (status >= 500) logger.error('未处理异常：', err);
        res.status(status).json({ error: status >= 500 ? '服务器内部错误' : err.message });
    });

    return app;
}
