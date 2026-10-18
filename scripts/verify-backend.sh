#!/bin/bash
# 验证部署到 HK 的后端 dist 是否包含本轮新代码（切分返回词汇/长难句）
D=/var/www/zhuopu/server/dist

echo "== 1. 切分提示词是否要求返回 vocabulary / longSentences =="
grep -c 'vocabulary' "$D/services/llm/prompts.js" 2>&1
grep -o 'longSentences' "$D/services/llm/prompts.js" 2>&1 | head -1

echo "== 2. apply 路由是否写入 passages.meta =="
grep -c 'savePassageMeta' "$D/routes/reviews.js" 2>&1

echo "== 3. contracts 是否带新字段 =="
grep -o 'longSentences' "$D/contracts.js" 2>&1 | head -1

echo "== 4. 关键文件修改时间 =="
ls -la --time-style=full-iso "$D/routes/reviews.js" "$D/services/llm/prompts.js" 2>&1

echo "== 5. 进程与加载的入口 =="
pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const a=JSON.parse(s);for(const p of a){if((p.name||'')==='zhuopu'){const e=p.pm2_env||{};console.log('  name='+e.name+'  cwd='+e.pm_cwd+'  script='+e.pm_exec_path+'  restarts='+e.restart_time);}}}catch(e){console.log(e.message)}});"
