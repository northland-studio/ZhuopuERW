#!/bin/bash
# HK：重建数据库（去掉第一次空迁移留下的假记录），补齐全部表，重启服务
set -u
DB=/var/www/zhuopu/data/zhuopu.db
cd /var/www/zhuopu/server || exit 1

echo "== 1. 停服务并删除空库 =="
pm2 stop zhuopu >/dev/null 2>&1
rm -f "$DB" "$DB-wal" "$DB-shm"
ls -la /var/www/zhuopu/data/ 2>/dev/null

echo "== 2. 确认迁移脚本存在 =="
ls dist/db/migrations/ | sed 's/^/  /'

echo "== 3. 执行迁移 =="
DB_FILE="$DB" node dist/db/migrate.js 2>&1 | tail -6

echo "== 4. 核对表 =="
node - <<'NODE'
const D = require('/var/www/zhuopu/server/node_modules/better-sqlite3');
const d = new D('/var/www/zhuopu/data/zhuopu.db', { readonly: true });
const rows = d.prepare("select name from sqlite_master where type='table' order by name").all();
console.log('  共 ' + rows.length + ' 张表：' + rows.map((r) => r.name).join(', '));
NODE

echo "== 5. 重启并自检 =="
pm2 restart zhuopu >/dev/null 2>&1
sleep 4
curl -s -o /dev/null -w "  health: %{http_code}\n" http://127.0.0.1:3901/api/health
curl -s -o /dev/null -w "  首页: %{http_code}\n" http://127.0.0.1:3901/
