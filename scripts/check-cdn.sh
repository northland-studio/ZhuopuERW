#!/bin/bash
B=https://cdn.zp.xuanjian.top/zhuopu/v1.2.0
for f in Zhuopu-v1.2.0-electron-win-x64-setup.exe Zhuopu-v1.2.0-tauri-win-x64.zip; do
    printf '%-46s ' "$f"
    code=$(curl -s -o /dev/null -w '%{http_code}' -I "$B/$f" --max-time 25)
    len=$(curl -sI "$B/$f" --max-time 25 | tr -d '\r' | sed -n 's/^[Cc]ontent-[Ll]ength: *//p' | tail -1)
    echo "HTTP $code  length=${len:-未知}"
done
