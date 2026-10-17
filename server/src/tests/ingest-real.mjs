/**
 * 真实试卷联调：docx/pdf/图片 → 文字 → 切分 → 落库
 * 运行：node src/tests/ingest-real.mjs [文件名]
 * 依赖：本地服务已在 3901 端口运行
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3901';
const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SAMPLES = path.join(ROOT, '_samples');
const envFile = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const JWT_SECRET = /^JWT_SECRET=(.*)$/m.exec(envFile)?.[1]?.trim();
const DB_FILE = path.join(ROOT, 'server', 'data', 'zhuopu.db');

const file = process.argv[2] || '2026年高考全国2卷英语高考真题.docx';
const filePath = path.join(SAMPLES, file);
if (!fs.existsSync(filePath)) {
    console.error('找不到材料：' + filePath);
    process.exit(1);
}

/* ---------- 内部登录（注入验证码，避免真的收信） ---------- */
const email = 'material-test@example.com';
const code = '246810';
const hash = crypto.createHash('sha256').update(`${email}|${code}|${JWT_SECRET}`).digest('hex');
const db = new Database(DB_FILE);
const pad = (n) => String(n).padStart(2, '0');
const d = new Date(Date.now() + 30 * 60_000);
const expiresAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
db.prepare(`INSERT INTO email_codes (email, code_hash, purpose, expires_at, ip, created_at) VALUES (?, ?, 'login', ?, '127.0.0.1', datetime('now','localtime'))`)
  .run(email, hash, expiresAt);
db.close();

const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
}).then((r) => r.json());
const token = login.token;
if (!token) { console.error('登录失败', login); process.exit(1); }
const auth = { Authorization: `Bearer ${token}` };
console.log('登录成功：' + email);

/* ---------- 1. 上传并解析 ---------- */
console.log(`\n=== 1. 上传解析：${file}（${(fs.statSync(filePath).size / 1024 / 1024).toFixed(2)} MB）===`);
const form = new FormData();
form.append('file', new Blob([fs.readFileSync(filePath)]), file);
const t0 = Date.now();
const ingestRes = await fetch(`${BASE}/api/upload/file`, { method: 'POST', headers: auth, body: form });
const ingest = await ingestRes.json();
console.log(`  HTTP ${ingestRes.status}  耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!ingest.ok) { console.error('  解析失败：', ingest); process.exit(1); }
console.log(`  通道：${ingest.source}  字符数：${ingest.length}`);
console.log(`  文件 URL：${ingest.fileUrl || '(无)'}`);
console.log(`  提示：${ingest.note || '(无)'}`);
console.log('  正文前 400 字：\n' + String(ingest.text).slice(0, 400).replace(/\n{2,}/g, '\n'));

const text = ingest.text;

/* ---------- 2. 建讲评 ---------- */
console.log('\n=== 2. 建讲评并切分 ===');
const created = await fetch(`${BASE}/api/reviews`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '2026 全国二卷 联调', kind: 'review' })
}).then((r) => r.json());
const reviewId = created.review.id;
console.log(`  讲评 #${reviewId}（${created.review.title}）`);

const t1 = Date.now();
const splitRes = await fetch(`${BASE}/api/reviews/${reviewId}/split`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
});
const split = await splitRes.json();
console.log(`  HTTP ${splitRes.status} 耗时 ${((Date.now() - t1) / 1000).toFixed(1)}s  模型=${split.model}  token=${split.usage?.total}`);
if (!split.draft) { console.error('  切分失败：', split); process.exit(1); }

const draft = split.draft;
console.log(`  原文 ${draft.passages.length} 篇，题目 ${draft.questions.length} 道`);
draft.passages.forEach((p, i) => console.log(`    P${i + 1} [${p.label}] ${p.content.length} 字符`));
const byType = {};
for (const q of draft.questions) byType[q.type] = (byType[q.type] || 0) + 1;
console.log('  题型分布：' + JSON.stringify(byType));
console.log('  题号：' + draft.questions.map((q) => q.numberLabel).join(','));
console.log('  答案：' + draft.questions.map((q) => q.answer || '-').join(','));
console.log('  选项数：' + draft.questions.map((q) => q.options.length).join(','));
if (draft.notes) console.log('  notes：' + draft.notes.slice(0, 300));

/* ---------- 3. 落库 ---------- */
console.log('\n=== 3. 落库 ===');
const apply = await fetch(`${BASE}/api/reviews/${reviewId}/apply`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ passages: draft.passages, questions: draft.questions })
}).then((r) => r.json());
console.log(`  HTTP 落库：${apply.ok ? 'ok' : '失败'}  题目落库 ${apply.questionIds?.length ?? 0} 道`);
const saved = apply.review;
if (saved) {
    const located = saved.questions.filter((q) => q.sourceStart != null).length;
    console.log(`  出处定位成功：${located}/${saved.questions.length}`);
    const first = saved.questions[0];
    if (first) console.log(`  首题：#${first.numberLabel} ${first.type} 选项${first.options.length} 答案${first.answer || '-'} 高亮 ${first.sourceStart}-${first.sourceEnd}`);
}

fs.writeFileSync(path.join(ROOT, 'server', 'data', `split-${reviewId}.json`), JSON.stringify({ draft, saved }, null, 2));
console.log(`\n  草稿已存：server/data/split-${reviewId}.json`);
