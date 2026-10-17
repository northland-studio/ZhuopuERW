/**
 * 真实试卷：逐题讲评联调（完形 + 语法填空各取几题），并核对汇总与 token 落库
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3901';
const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const envFile = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const JWT_SECRET = /^JWT_SECRET=(.*)$/m.exec(envFile)?.[1]?.trim();
const DB_FILE = path.join(ROOT, 'server', 'data', 'zhuopu.db');
const REVIEW_ID = Number(process.argv[2] || 1);

const email = 'material-test@example.com';
const code = '135790';
const hash = crypto.createHash('sha256').update(`${email}|${code}|${JWT_SECRET}`).digest('hex');
const db = new Database(DB_FILE);
const pad = (n) => String(n).padStart(2, '0');
const d = new Date(Date.now() + 30 * 60_000);
const expiresAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
db.prepare(`INSERT INTO email_codes (email, code_hash, purpose, expires_at, ip, created_at) VALUES (?, ?, 'login', ?, '127.0.0.1', datetime('now','localtime'))`)
  .run(email, hash, expiresAt);
db.close();

const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code })
}).then((r) => r.json());
const auth = { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/json' };

const detail = await fetch(`${BASE}/api/reviews/${REVIEW_ID}`, { headers: auth }).then((r) => r.json());
const review = detail.review;
console.log(`讲评 #${review.id}「${review.title}」 ${review.questions.length} 题`);

// 挑：2 道完形（41、42）+ 1 道语法（62）+ 1 道七选五（36）
const wanted = ['41', '42', '62', '36'];
const targets = wanted.map((n) => review.questions.find((q) => q.numberLabel === n)).filter(Boolean);
console.log('选中题目：' + targets.map((q) => `#${q.numberLabel}(${q.type})`).join(' '));

const t0 = Date.now();
const res = await fetch(`${BASE}/api/reviews/${REVIEW_ID}/analyze`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ questionIds: targets.map((q) => q.id), limit: 20 })
});
const out = await res.json();
console.log(`HTTP ${res.status} 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s 成功 ${out.analyzed} 题 token=${out.tokens}`);

const after = out.review;
for (const q of targets) {
    const saved = after.questions.find((x) => x.id === q.id);
    const a = saved.analysis || {};
    console.log(`\n--- #${saved.numberLabel} ${saved.type} 答案=${saved.answer || a.answer || '-'} ---`);
    console.log(`  考点：${a.skill || '(空)'}`);
    console.log(`  思路：${(a.reasoning || '').slice(0, 90)}`);
    console.log(`  干扰项：${(a.distractors || []).length} 条 | 词汇：${(a.vocabulary || []).length} 个 | 长难句：${(a.longSentences || []).length} 句`);
    console.log(`  选项解析：${(a.optionGlosses || []).length} 条`);
    if (a.optionGlosses?.length) {
        console.log('    ' + a.optionGlosses.map((g) => `${g.label}:${(g.meaning || '').slice(0, 14)}`).join(' | '));
    }
    console.log(`  出处：${(a.sourceQuote || '').slice(0, 60)}`);
    console.log(`  已定位高亮：${saved.sourceStart}-${saved.sourceEnd}`);
}

console.log(`\n=== 汇总 ===`);
console.log(`  概要：${(after.summary || '').slice(0, 120)}`);
console.log(`  词汇表：${(after.vocab || []).length} 个 | 长难句：${(after.longSentences || []).length} 句`);
if (after.vocab?.length) console.log('    ' + after.vocab.slice(0, 8).map((v) => `${v.word}(${v.pos})`).join(', '));
