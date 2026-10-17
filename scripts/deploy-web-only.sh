#!/bin/bash
# 只更新前端产物到 HK（不动服务与数据库），随后自检字体
set -e
APP=/var/www/zhuopu
TMP=/tmp/zhuopu-web-dist

echo "== 1. 解包新前端 =="
rm -rf "$TMP"; mkdir -p "$TMP"
tar -xzf /tmp/zhuopu-web.tgz -C "$TMP"
ls "$TMP" | sed 's/^/  /'

echo "== 2. 替换 dist（保留旧目录做回滚）=="
if [ -d "$APP/web/dist" ]; then
    rm -rf "$APP/web/dist.bak"
    mv "$APP/web/dist" "$APP/web/dist.bak"
fi
mv "$TMP" "$APP/web/dist"

echo "== 3. 自检 =="
CSS=$(ls "$APP"/web/dist/assets/*.css | head -1)
echo -n "  CSS 文件: "; basename "$CSS"
echo -n "  @font-face: "; grep -c "@font-face" "$CSS" || true
echo -n "  字体变量: "; grep -o -- "--font-reading:[^;]*" "$CSS" | head -1 | cut -c1-70
echo -n "  英文正文规则: "; grep -c "rd-text,.rd-option" "$CSS" || true
echo -n "  字体文件: "; curl -s -o /dev/null -w "%{http_code} %{size_download}B\n" http://127.0.0.1:3901/fonts/CrimsonText-Regular.ttf
echo -n "  首页: "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3901/
echo -n "  首页引用的 CSS: "; grep -o 'assets/index-[^"]*\.css' "$APP/web/dist/index.html" | head -1
