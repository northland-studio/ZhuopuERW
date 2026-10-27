#!/bin/bash
# 深挖机器人：gacha 实现 + 机器人服务器（43.248.3.161）上的运行状态
mask() { local v="$1"; [ -z "$v" ] && { echo "(空)"; return; }; echo "${v:0:4}***（长度 ${#v}）"; }
KEY=/root/.ssh/id_napcat
HOST=root@43.248.3.161
PORT=20043

echo "======== 1. 本机隧道口连通性 ========"
for p in 13001 13003 6099; do
  timeout 3 bash -c "cat < /dev/null > /dev/tcp/127.0.0.1/$p" 2>/dev/null && echo "  127.0.0.1:$p 通" || echo "  127.0.0.1:$p 不通"
done

echo
echo "======== 2. gacha 机器人代码（HK 侧）========"
echo "  --- bot.py ---"
sed -n '1,40p' /opt/xuanjian-gacha/bot.py 2>/dev/null | sed 's/^/    /'
echo "  --- plugins 目录 ---"
find /opt/xuanjian-gacha/plugins -maxdepth 2 -name '*.py' 2>/dev/null | head -20 | sed 's/^/    /'
echo "  --- .env 键（值打码）---"
grep -E '^[A-Z_]+=' /opt/xuanjian-gacha/.env 2>/dev/null | while IFS='=' read -r k v; do
  case "$k" in *TOKEN*|*KEY*|*PASS*|*SECRET*) echo "    $k=$(mask "$v")";; *) echo "    $k=$v";; esac
done

echo
echo "======== 3. 机器人服务器 43.248.3.161 ========"
ssh -i $KEY -p $PORT -o StrictHostKeyChecking=no -o ConnectTimeout=10 $HOST '
  echo "  --- 主机 ---"
  hostname; uptime | sed "s/^/  /"
  echo "  --- 监听端口 ---"
  ss -lntp 2>/dev/null | grep -E ":(3001|6099|2536|8080)\s" | sed "s/^/    /"
  echo "  --- 机器人相关进程 ---"
  ps aux 2>/dev/null | grep -viE "grep|ssh" | grep -iE "nonebot|bot\.py|napcat|koishi|node .*bot" | head -8 | cut -c1-160 | sed "s/^/    /"
  echo "  --- docker ---"
  command -v docker >/dev/null && docker ps --format "{{.Names}}  {{.Status}}  {{.Ports}}" 2>/dev/null | head -8 | sed "s/^/    /" || echo "    无 docker"
  echo "  --- systemd 单元 ---"
  systemctl list-units --type=service --state=running 2>/dev/null | grep -iE "bot|napcat|gacha|nonebot" | head -6 | sed "s/^/    /"
  echo "  --- 目录线索 ---"
  ls -d /root/*bot* /root/*gacha* /opt/*bot* /opt/*gacha* /root/napcat* 2>/dev/null | head -10 | sed "s/^/    /"
' 2>&1 | sed 's/^/  /'
