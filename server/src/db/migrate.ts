import { db, migrate, now } from './index.js';
import { env } from '../env.js';
import { logger } from '../logger.js';

/** 独立执行迁移：pnpm --filter zhuopu-server migrate */
const result = migrate();

// 首次初始化时把默认设置写进去（模型、开关；Key 由后台填写）
const defaults: Record<string, string> = {
    'llm.defaultProvider': 'deepseek',
    'llm.allowProviders': JSON.stringify(['deepseek', 'glm']),
    'llm.deepseek.model': env.llm.deepseek.model,
    'llm.glm.model': env.llm.glm.model,
    'feature.cloudSave': 'true',
    'feature.share': 'true',
    'feature.activationRequired': 'false'
};
for (const [key, value] of Object.entries(defaults)) {
    const exist = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
    if (!exist) {
        db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, now());
    }
}

const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all() as { name: string }[];
logger.info(`数据库：${env.dbFile}`);
logger.info(`WAL 模式：${db.pragma('journal_mode', { simple: true })}`);
logger.info(`已应用迁移：${result.applied.length} 个（跳过 ${result.skipped} 个）`);
logger.info(`表（${tables.length}）：${tables.map((t) => t.name).join(', ')}`);
