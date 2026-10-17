#!/bin/bash
# 检查线上字体是否真的可用（文件、CSS 引用、实际响应头）
D=/var/www/zhuopu/web/dist

echo "== 1. 字体文件 =="
ls -la "$D/fonts/" 2>/dev/null || echo "  没有 fonts 目录"

echo "== 2. @font-face 是否在 CSS 里 =="
grep -o "@font-face{[^}]*}" "$D"/assets/*.css 2>/dev/null | head -2
echo "== 3. --font-reading 取值 =="
grep -o -- "--font-reading:[^;]*" "$D"/assets/*.css 2>/dev/null | head -2
echo "== 4. .rd-text 的 font-family =="
grep -o "\.rd-text{[^}]*}" "$D"/assets/*.css 2>/dev/null | head -1

echo "== 5. 实际 HTTP 响应 =="
for u in /fonts/CrimsonText-Regular.ttf /brand/logo.png; do
    printf "  %-38s " "$u"
    curl -s -o /dev/null -w "code=%{http_code} type=%{content_type} size=%{size_download}\n" "http://127.0.0.1:3901$u"
done

echo "== 6. index.html 是否 preload 字体 =="
grep -o '<link[^>]*Crimson[^>]*>' "$D/index.html" | head -2
grep -o '<link[^>]*icon[^>]*>' "$D/index.html" | head -2
