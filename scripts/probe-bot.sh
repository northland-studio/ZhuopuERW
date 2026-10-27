#!/bin/bash
# 巡检机器人相关组件：napcat 三条隧道、gacha 目录、notice 的 OneBot 连接状态
mask() { local v="$1"; [ -z "$v" ] && { echo "(空)"; return; }; echo "${v:0:4}***（长度 ${#v}）"; }

echo "======== 1. pm2 中的机器人相关进程 ========"
pm2 jlist 2>/dev/null | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try{
    const arr=JSON.parse(s);
    for(const p of arr){
      const e=p.pm2_env||{};
      const n=e.name||'';
      if(!/napcat|notice|gacha|bot/i.test(n)) continue;
      console.log('  '+n+'  status='+e.status+'  restarts='+e.restart_time+'  uptime='+Math.round((Date.now()-(e.pm_uptime||0))/1000)+'s');
      console.log('    cwd='+(e.pm_cwd||'?')+'  script='+(e.pm_exec_path||'?'));
    }
  }catch(e){console.log('  解析失败: '+e.message)}
});
"

echo
echo "======== 2. 三条隧道脚本内容（密钥打码）========"
for f in /opt/napcat-tunnel.sh /opt/napcat-gacha-tunnel.sh /opt/napcat-notice-tunnel.sh /opt/mcs-daemon-tunnel.sh; do
  [ -f "$f" ] || continue
  echo "  --- $f ---"
  grep -vE '^\s*(#|$)' "$f" | sed -E 's/(TOKEN|token|PASSWORD|password)([=: ]+)[^ ]+/\1\2<masked>/g' | head -12 | sed 's/^/    /'
done

echo
echo "======== 3. 本地监听端口（隧道出口）========"
ss -lntp 2>/dev/null | grep -E ':(13003|13001|13002|3001|3901|3910)\s' | sed 's/^/  /' || echo "  未发现相关监听"

echo
echo "======== 4. /opt/xuanjian-gacha 内容 ========"
ls -la /opt/xuanjian-gacha 2>/dev/null | head -12 | sed 's/^/  /'
[ -f /opt/xuanjian-gacha/package.json ] && head -20 /opt/xuanjian-gacha/package.json | sed 's/^/    /'
[ -f /opt/xuanjian-gacha/README.md ] && head -12 /opt/xuanjian-gacha/README.md | sed 's/^/    /'

echo
echo "======== 5. notice 服务最近的 OneBot 连接状态 ========"
grep -a 'onebot-ws' /root/.pm2/logs/xuanjian-notice-out.log 2>/dev/null | tail -6 | cut -c1-160 | sed 's/^/  /'
echo "  --- 错误日志里的连接问题 ---"
grep -aE 'onebot|ECONNREFUSED|连接断开|重连' /root/.pm2/logs/xuanjian-notice-error.log 2>/dev/null | tail -6 | cut -c1-160 | sed 's/^/  /'

echo
echo "======== 6. 机器人服务器可达性（从隧道目标推）========"
ssh -o ConnectTimeout=6 -o StrictHostKeyChecking=no -T git@github.com 2>&1 | head -1 >/dev/null
for t in 127.0.0.1:13003 127.0.0.1:3001; do
  h=${t%%:*}; p=${t##*:}
  timeout 3 bash -c "cat < /dev/null > /dev/tcp/$h/$p" 2>/dev/null && echo "  $t 可连通" || echo "  $t 连不上"
done

echo
echo "======== 7. notice 配置里的 OneBot 目标 ========"
grep -E '^(ONEBOT_|BROADCAST_|OPERATORS_)' /opt/xuanjian-notice/.env 2>/dev/null | while IFS='=' read -r k v; do
  case "$k" in *TOKEN*) echo "  $k=$(mask "$v")";; *) echo "  $k=$v";; esac
done
