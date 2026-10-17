#!/bin/bash
# 全量更新 HK：替换 server/dist 与 web/dist，重启 pm2，自检
set -e
APP=/var/www/zhuopu
TMP=/tmp/zhuopu-update
STAMP=$(date +%Y%m%d-%H%M%S)

echo "== 1. 解包 =="
rm -rf "$TMP"; mkdir -p "$TMP"
tar -xzf /tmp/zhuopu-update.tgz -C "$TMP"
ls "$TMP" | sed 's/^/  /'

echo "== 2. 备份并替换 =="
for d in web/dist server/dist; do
    if [ -d "$APP/$d" ]; then
        rm -rf "$APP/$d.bak-$STAMP"
        mv "$APP/$d" "$APP/$d.bak-$STAMP"
        echo "  已备份 $d -> $d.bak-$STAMP"
    fi
done
mkdir -p "$APP/web" "$APP/server"
mv "$TMP/web/dist" "$APP/web/dist"
mv "$TMP/server/dist" "$APP/server/dist"

echo "== 3. 依赖（仅在 package.json 变化时安装）=="
if ! diff -q "$TMP/server/package.json" "$APP/server/package.json" >/dev/null 2>&1; then
    cp "$TMP/server/package.json" "$APP/server/package.json"
    cd "$APP/server" && npm install --omit=dev --no-audit --no-fund 2>&1 | tail -3
else
    echo "  依赖无变化，跳过安装"
fi

echo "== 4. 数据库迁移（幂等）=="
cd "$APP/server" && node dist/db/migrate.js 2>&1 | tail -3

echo "== 5. 重启 =="
pm2 restart zhuopu >/dev/null 2>&1
sleep 4

echo "== 6. 自检 =="
printf '  health: '; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3901/api/health
printf '  首页: '; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3901/
printf '  字体: '; curl -s -o /dev/null -w "%{http_code} %{size_download}B\n" http://127.0.0.1:3901/fonts/TimesNewRoman.ttf
printf '  前端入口: '; grep -o 'assets/index-[^"]*\.js' "$APP/web/dist/index.html" | head -1
printf '  nginx(https): '; curl -sk -o /dev/null -w "%{http_code}\n" -H 'Host: zhuopu.xuanjian.top' https://127.0.0.1/
echo "完成"
