#!/bin/bash
# 鍦ㄦ湇鍔″櫒涓婄敤绾夸笂 JWT_SECRET 涓虹涓€涓敤鎴风鍙戜竴涓彧璇婚獙璇佺敤 token
set -eu
cd /var/www/zhuopu/server
node - <<'NODE'
const fs = require('fs');
const path = '/var/www/zhuopu/.env';
const env = {};
for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
}
const jwt = require('/var/www/zhuopu/server/node_modules/jsonwebtoken');
const D = require('/var/www/zhuopu/server/node_modules/better-sqlite3');
const db = new D('/var/www/zhuopu/data/zhuopu.db', { readonly: true });
const u = db.prepare('SELECT id, email, role FROM users ORDER BY id LIMIT 1').get();
if (!u) { console.log('NO_USER'); process.exit(0); }
const token = jwt.sign({ uid: u.id, role: u.role || 'user' }, env.JWT_SECRET, { expiresIn: '2h' });
const r = db.prepare('SELECT id, title FROM review_sets WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1').get();
console.log(JSON.stringify({ uid: u.id, email: u.email, reviewId: r ? r.id : null, title: r ? r.title : null, token }));
NODE
