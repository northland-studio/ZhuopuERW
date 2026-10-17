-- 0001 初始结构：用户 / 邮箱验证码 / 讲评（多篇原文 + 题目）/ 分享 / 用量 / 设置 / 激活码
-- 约定：所有时间用本地时间字符串 'YYYY-MM-DD HH:MM:SS'（与 SQLite datetime('now','localtime') 一致）

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    password_set_at TEXT,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    last_login_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 邮箱验证码（只存哈希，明文不落库）
CREATE TABLE IF NOT EXISTS email_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL,
    code_hash  TEXT NOT NULL,
    purpose    TEXT NOT NULL CHECK (purpose IN ('login', 'reset', 'verify')),
    attempts   INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    used_at    TEXT,
    ip         TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes(email, purpose, created_at DESC);

-- 讲评：kind=review（讲评模式，可含多篇原文）/ single（单题临时讲评）
CREATE TABLE IF NOT EXISTS review_sets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'review' CHECK (kind IN ('review', 'single')),
    status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'analyzed')),
    source      TEXT NOT NULL DEFAULT 'cloud' CHECK (source IN ('cloud', 'file')),
    -- 讲评级汇总：重难点词汇 / 长难句 / 概览（AI 输出的汇总，JSON）
    summary     TEXT DEFAULT '',
    vocab       TEXT DEFAULT '[]',
    long_sentences TEXT DEFAULT '[]',
    meta        TEXT DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_review_sets_user ON review_sets(user_id, kind, deleted_at, updated_at DESC);

-- 原文（一篇讲评可以有多篇原文，如一张试卷的完形 + 阅读）
CREATE TABLE IF NOT EXISTS passages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    review_set_id INTEGER NOT NULL REFERENCES review_sets(id) ON DELETE CASCADE,
    ordinal       INTEGER NOT NULL DEFAULT 1,
    label         TEXT DEFAULT '',
    content       TEXT NOT NULL DEFAULT '',
    meta          TEXT DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_passages_set ON passages(review_set_id, ordinal);

-- 题目：四种题型；analysis 存 AI 讲评结果（JSON 契约见 server/src/contracts.ts）
CREATE TABLE IF NOT EXISTS questions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    review_set_id INTEGER NOT NULL REFERENCES review_sets(id) ON DELETE CASCADE,
    passage_id    INTEGER REFERENCES passages(id) ON DELETE SET NULL,
    ordinal       INTEGER NOT NULL DEFAULT 1,
    type          TEXT NOT NULL CHECK (type IN ('cloze', 'reading', 'seven_five', 'grammar')),
    number_label  TEXT NOT NULL DEFAULT '',
    stem          TEXT DEFAULT '',
    options       TEXT DEFAULT '[]',
    answer        TEXT DEFAULT '',
    -- 原文出处定位（用于左侧高亮）：起始偏移 + 结束偏移 + 空白占位文案
    source_start  INTEGER,
    source_end    INTEGER,
    analysis      TEXT DEFAULT '{}',
    analyzed_at   TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_questions_set ON questions(review_set_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_questions_passage ON questions(passage_id, ordinal);

-- 分享链接（公开只读导入用）
CREATE TABLE IF NOT EXISTS shares (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    review_set_id INTEGER NOT NULL REFERENCES review_sets(id) ON DELETE CASCADE,
    token         TEXT NOT NULL UNIQUE,
    created_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at    TEXT,
    view_count    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_shares_set ON shares(review_set_id);

-- 计费与吞吐：每次 LLM 调用一条
CREATE TABLE IF NOT EXISTS llm_usage (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
    provider          TEXT NOT NULL,
    model             TEXT NOT NULL,
    purpose           TEXT NOT NULL DEFAULT '',
    prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens      INTEGER NOT NULL DEFAULT 0,
    latency_ms        INTEGER NOT NULL DEFAULT 0,
    ok                INTEGER NOT NULL DEFAULT 1,
    error             TEXT DEFAULT '',
    created_at        TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_usage_time ON llm_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_user ON llm_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_model ON llm_usage(provider, model, created_at DESC);

-- 上传记录（七牛直传或服务端中转都记一条，便于追踪与清理）
CREATE TABLE IF NOT EXISTS uploads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind       TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'document')),
    object_key TEXT NOT NULL DEFAULT '',
    url        TEXT NOT NULL DEFAULT '',
    mime       TEXT DEFAULT '',
    size       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id, created_at DESC);

-- 站点设置（模型选择、API Key、开关；敏感值由服务端加密后存这里）
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 激活码（当前只预留：后台可生成查看，不拦截使用）
CREATE TABLE IF NOT EXISTS activation_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT NOT NULL UNIQUE,
    batch      TEXT DEFAULT '',
    note       TEXT DEFAULT '',
    used_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_at    TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_activation_batch ON activation_codes(batch);

-- 迁移版本（由 migrate.ts 维护）
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
