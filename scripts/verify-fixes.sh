#!/bin/bash
# 验证本轮修复是否已在线上生效
D=/var/www/zhuopu

echo "== 1. 字体 =="
curl -s -o /dev/null -w "  Liberation 400: %{http_code} %{size_download}B\n" http://127.0.0.1:3901/fonts/LiberationSerif-Regular.ttf

echo "== 2. 前端入口 =="
grep -o 'assets/index-[^"]*\.js' "$D/web/dist/index.html" | head -1 | sed 's/^/  /'

echo "== 3. 长试卷分块切分 =="
grep -c 'splitIntoSections' "$D/server/dist/services/analysis.js" | sed 's/^/  命中: /'
grep -o 'maxTokens: 16000' "$D/server/dist/services/analysis.js" | head -1 | sed 's/^/  /'

echo "== 4. 用户名规则放宽 =="
grep -c '用户名不能包含' "$D/server/dist/routes/auth.js" | sed 's/^/  命中: /'

echo "== 5. 截断/空正文明确报错 =="
grep -c 'finish_reason' "$D/server/dist/services/llm/index.js" | sed 's/^/  命中: /'

echo "== 6. 导出包含篇级词汇 =="
grep -c '篇级词汇' "$D/server/dist/services/reviews.js" | sed 's/^/  命中: /'

echo "== 7. 健康 =="
curl -s -o /dev/null -w "  health %{http_code}\n" http://127.0.0.1:3901/api/health
