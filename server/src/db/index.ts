import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { env, ensureDir } from '../env.js';
import { logger } from '../logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
/** 迁移脚本目录：开发时在 src，构建后在 dist */
const MIGRATIONS_DIR = fs.existsSync(path.join(here, 'migrations'))
    ? path.join(here, 'migrations')
    : path.join(here, '..', 'src', 'db', 'migrations');

ensureDir(path.dirname(env.dbFile));

export const db = new Database(env.dbFile);

// WAL + 稳健性设置
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('cache_size = -8000');

/** 当前本地时间字符串，与 SQLite datetime('now','localtime') 口径一致 */
export function now(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 执行全部未应用的迁移（幂等，按文件名排序） */
export function migrate(): { applied: string[]; skipped: number } {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);
    const applied = new Set(
        (db.prepare('SELECT version FROM schema_migrations').all() as { version: string }[]).map((r) => r.version)
    );
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    const done: string[] = [];
    let skipped = 0;
    for (const file of files) {
        if (applied.has(file)) { skipped++; continue; }
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        const run = db.transaction(() => {
            db.exec(sql);
            db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
        });
        run();
        done.push(file);
        logger.info(`数据库迁移已应用：${file}`);
    }
    return { applied: done, skipped };
}

/** 事务包装（better-sqlite3 是同步的，回调内不要 await） */
export function tx<T>(fn: () => T): T {
    return db.transaction(fn)();
}

/* ---------- 便捷查询 ---------- */
export function get<T = unknown>(sql: string, ...params: unknown[]): T | undefined {
    return db.prepare(sql).get(...params) as T | undefined;
}
export function all<T = unknown>(sql: string, ...params: unknown[]): T[] {
    return db.prepare(sql).all(...params) as T[];
}
export function run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number } {
    const r = db.prepare(sql).run(...params);
    return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) };
}

/** 读取 JSON 字段的安全封装（坏数据不炸接口） */
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
}
