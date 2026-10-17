#!/bin/bash
# HK：为 zhuopu.xuanjian.top 签证书并配置 nginx（可重复执行）
set -e
D=zhuopu.xuanjian.top

if [ ! -d "/etc/letsencrypt/live/$D" ]; then
    echo "== 申请证书 =="
    certbot certonly --dns-cloudflare \
        --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
        --dns-cloudflare-propagation-seconds 45 \
        -d "$D" --key-type ecdsa --non-interactive --agree-tos \
        -m shenqiuzhe@163.com --cert-name "$D" 2>&1 | tail -3
else
    echo "== 证书已存在 =="
fi

if [ ! -f "/etc/letsencrypt/live/$D/fullchain.pem" ]; then
    echo "没有证书，nginx 配置跳过（请先确认 Cloudflare 已加 $D 的 A 记录）"
    exit 0
fi

echo "== 写 nginx 站点 =="
cat > /etc/nginx/sites-available/zhuopu <<'NGX'
server {
    listen 80;
    server_name zhuopu.xuanjian.top;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl http2;
    server_name zhuopu.xuanjian.top;

    ssl_certificate     /etc/letsencrypt/live/zhuopu.xuanjian.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/zhuopu.xuanjian.top/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 42m;

    location / {
        proxy_pass http://127.0.0.1:3901;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
NGX

ln -sf /etc/nginx/sites-available/zhuopu /etc/nginx/sites-enabled/zhuopu
nginx -t 2>&1 | tail -2
systemctl reload nginx
echo "== 自检 =="
curl -sk -o /dev/null -w "  https 本机(带 Host): %{http_code}\n" -H "Host: $D" https://127.0.0.1/
curl -sk -o /dev/null -w "  https 本机 /api/health: %{http_code}\n" -H "Host: $D" https://127.0.0.1/api/health
echo "完成"
