#!/bin/bash
# HK 端到端冒烟：发验证码 → 从库里取出验证码哈希无法反推，改为直接验证接口是否 200 且落库
set -u
BASE=http://127.0.0.1:3901
MAIL=probe-$(date +%s)@example.com

echo "== 1. send-code（真实发信，收件人为探针邮箱域）=="
CODE=$(curl -s -m 20 -X POST "$BASE/api/auth/send-code" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$MAIL\",\"purpose\":\"login\"}")
echo "  $CODE"

echo "== 2. 库内是否落了验证码记录 =="
node - "$MAIL" <<'NODE'
const D = require('/var/www/zhuopu/server/node_modules/better-sqlite3');
const db = new D('/var/www/zhuopu/data/zhuopu.db', { readonly: true });
const email = process.argv[2];
const row = db.prepare('SELECT email, purpose, expires_at FROM email_codes WHERE email = ? ORDER BY id DESC LIMIT 1').get(email);
console.log('  ', row ? `已落库：${row.email} / ${row.purpose} / 过期 ${row.expires_at}` : '未落库');
NODE

echo "== 3. 接口健康 =="
for p in /api/health / /api/reviews /api/admin/overview; do
    printf '  %-22s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")"
done

echo "== 4. 外网访问（经 nginx + 证书）=="
curl -sk -o /dev/null -w "  https://zhuopu.xuanjian.top/ -> %{http_code}\n" -H 'Host: zhuopu.xuanjian.top' https://127.0.0.1/
