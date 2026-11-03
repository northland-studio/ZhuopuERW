#!/bin/bash
# 修复：上一轮部署把 server/dist 备份走但没替换回来
set -u
APP=/var/www/zhuopu

cd "$APP/server" || exit 1
echo "== 当前 dist 状态 =="
ls -d dist* 2>/dev/null || echo "  没有 dist"

if [ ! -d dist ]; then
    LATEST=$(ls -d dist.bak-* 2>/dev/null | sort | tail -1)
    if [ -n "$LATEST" ]; then
        mv "$LATEST" dist
        echo "  已从 $LATEST 恢复 dist"
    else
        echo "  没有可恢复的备份"
    fi
fi

echo "== 迁移目录检查 =="
ls "$APP/server/dist/db/migrations" 2>/dev/null || {
    mkdir -p "$APP/server/dist/db/migrations"
    echo "  已补建 migrations 目录（空）"
}

echo "== 重启 =="
pm2 restart zhuopu >/dev/null 2>&1
sleep 5
printf "  health: "
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3901/api/health
printf "  首页: "
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3901/
