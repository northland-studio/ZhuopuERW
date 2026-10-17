#!/bin/bash
# HK：检查数据库文件与表，强制补齐迁移，然后重启服务
set -u
DB=/var/www/zhuopu/data/zhuopu.db

echo "== 1. data 目录 =="
ls -la /var/www/zhuopu/data/ 2>/dev/null || echo "  (不存在)"

echo "== 2. 两个可能位置的表数量 =="
for f in /var/www/zhuopu/data/zhuopu.db /var/www/zhuopu/server/data/zhuopu.db; do
    if [ -f "$f" ]; then
        n=$(node -e "const D=require('/var/www/zhuopu/server/node_modules/better-sqlite3');const d=new D(process.argv[1],{readonly:true});console.log(d.prepare(\"select count(*) c from sqlite_master where type='table'\").get().c);" "$f" 2>/dev/null || echo '?')
        echo "  $f -> $n 张表"
    else
        echo "  $f -> 不存在"
    fi
done

echo "== 3. 强制迁移（显式指定 DB_FILE）=="
cd /var/www/zhuopu/server
DB_FILE="$DB" node dist/db/migrate.js 2>&1 | tail -8

echo "== 4. 迁移后核对关键表 =="
node -e "const D=require('/var/www/zhuopu/server/node_modules/better-sqlite3');const d=new D(process.argv[1],{readonly:true});const rows=d.prepare(\"select name from sqlite_master where type='table' order by name\").all();console.log('  共', rows.length, '张表:', rows.map(r=>r.name).join(', '));" "$DB" 2>&1

echo "== 5. 重启并自检 =="
pm2 restart zhuopu >/dev/null 2>&1
sleep 4
curl -s -o /dev/null -w "  health: %{http_code}\n" http://127.0.0.1:3901/api/health
echo -n "  send-code 探针: "
curl -s -X POST http://127.0.0.1:3901/api/auth/send-code -H 'Content-Type: application/json' -d '{"email":"probe@example.com"}' | head -c 160
echo
