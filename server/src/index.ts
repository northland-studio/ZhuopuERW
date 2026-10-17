import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { assertEnv, env, ROOT } from './env.js';
import { logger } from './logger.js';
import { migrate } from './db/index.js';
import { createApp } from './app.js';
import { verifyMail } from './services/mail.js';

async function main() {
    assertEnv();
    const applied = migrate().applied;
    logger.info(`数据库迁移：${applied.length ? applied.join(', ') : '已是最新'}`);

    const app = createApp();

    // 生产：托管前端构建产物（SSG 产物 + SPA 回退）
    const webDist = path.join(ROOT, 'web', 'dist');
    if (fs.existsSync(webDist)) {
        app.use(express.static(webDist, { index: false, maxAge: env.isProd ? '7d' : 0 }));
        app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
        logger.info(`前端静态托管：${webDist}`);
    } else {
        logger.warn('未找到 web/dist，仅提供 API（开发时请用 pnpm dev:web 起 Vite）');
    }

    const server = app.listen(env.port, env.host, () => {
        logger.info(`琢璞英语讲评工作台 服务已启动 http://${env.host}:${env.port}（${env.nodeEnv}）`);
    });

    // 启动时做一次邮件自检（失败不阻断启动，只报错）
    verifyMail().catch(() => {});

    const shutdown = (sig: string) => {
        logger.info(`收到 ${sig}，正在关闭...`);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 3000);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
    logger.error('启动失败：', e);
    process.exit(1);
});
