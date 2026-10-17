#!/bin/bash
# HK 部署：zhuopu.xuanjian.top（pm2 + nginx + certbot DNS-01 + SQLite）
#
# 本脚本不含任何密钥：所有敏感值从同目录的 .env.production 读取，
# 该文件不进版本库（见 .gitignore）。执行前先准备好它：
#   cp .env.production.example .env.production && vi .env.production
set -euo pipefail

APP=${APP:-/var/www/zhuopu}
DOMAIN=${DOMAIN:-zhuopu.xuanjian.top}
PORT=${PORT:-3901}
BUNDLE=${BUNDLE:-/tmp/zhuopu-deploy.tgz}
ENV_SRC=${ENV_SRC:-$(dirname "$0")/.env.production}

if [ ! -f "$ENV_SRC" ]; then
    echo "缺少 $ENV_SRC（生产环境变量文件），已终止"
    exit 1
fi

echo "== 1. 解包 =="
rm -rf "$APP"
mkdir -p "$APP"
tar -xzf "$BUNDLE" -C "$APP"
ls "$APP" | sed 's/^/  /'

echo "== 2. 安装生产依赖 =="
cd "$APP/server"
npm install --omit=dev --no-audit --no-fund 2>&1 | tail -3

echo "== 3. 安装环境变量 =="
install -m 600 "$ENV_SRC" "$APP/.env"
mkdir -p "$APP/data"

echo "== 4. 数据库迁移 =="
node dist/db/migrate.js 2>&1 | tail -4

echo "== 5. pm2 =="
pm2 delete zhuopu >/dev/null 2>&1 || true
pm2 start dist/index.js --name zhuopu --cwd "$APP/server" 2>&1 | tail -3
pm2 save >/dev/null 2>&1 || true
sleep 3
curl -s -o /dev/null -w "  本地 health: %{http_code}\n" "http://127.0.0.1:$PORT/api/health"

echo "== 6. 证书 + nginx =="
bash "$(dirname "$0")/setup-hk-site.sh"
echo "完成"
