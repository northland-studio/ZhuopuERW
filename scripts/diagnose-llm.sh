#!/bin/bash
# 查看线上模型配置与最近失败样本
cd /var/www/zhuopu/server || exit 1

echo "== 1. settings 里的 llm.* =="
node - <<'NODE'
const D = require('/var/www/zhuopu/server/node_modules/better-sqlite3');
const db = new D('/var/www/zhuopu/data/zhuopu.db', { readonly: true });
for (const r of db.prepare("SELECT key, value FROM settings WHERE key LIKE 'llm.%'").all()) {
    console.log('  ' + r.key + ' = ' + (r.key.includes('apiKey') ? '<set>' : r.value));
}
NODE

echo "== 2. 最近 10 次大文本切分的文本长度与结果 =="
node - <<'NODE'
const D = require('/var/www/zhuopu/server/node_modules/better-sqlite3');
const db = new D('/var/www/zhuopu/data/zhuopu.db', { readonly: true });
for (const r of db.prepare("SELECT id, provider, model, purpose, prompt_tokens, completion_tokens, total_tokens, latency_ms, ok, substr(error,1,120) AS err, created_at FROM llm_usage ORDER BY id DESC LIMIT 12").all()) {
    console.log(`  #${r.id} ${r.created_at} ${r.provider}/${r.model} ${r.purpose} prompt=${r.prompt_tokens} completion=${r.completion_tokens} total=${r.total_tokens} ${r.ok ? 'OK' : 'FAIL ' + r.err} ${r.latency_ms}ms`);
}
NODE

echo "== 3. 讲评里篇幅统计（找出长试卷）=="
node - <<'NODE'
const D = require('/var/www/zhuopu/server/node_modules/better-sqlite3');
const db = new D('/var/www/zhuopu/data/zhuopu.db', { readonly: true });
for (const r of db.prepare(`
  SELECT r.id, r.title, r.created_at,
         (SELECT COUNT(*) FROM passages p WHERE p.review_set_id = r.id) AS passages,
         (SELECT COALESCE(SUM(LENGTH(content)),0) FROM passages p WHERE p.review_set_id = r.id) AS chars,
         (SELECT COUNT(*) FROM questions q WHERE q.review_set_id = r.id) AS questions
  FROM review_sets r WHERE r.deleted_at IS NULL ORDER BY r.id DESC LIMIT 8`).all()) {
    console.log(`  #${r.id} ${r.title} 篇=${r.passages} 字符=${r.chars} 题=${r.questions}`);
}
NODE
