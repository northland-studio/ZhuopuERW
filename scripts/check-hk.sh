#!/bin/bash
printf 'health: '
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3901/api/health
printf 'home: '
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3901/
printf 'front: '
grep -o 'assets/index-[^"]*\.js' /var/www/zhuopu/web/dist/index.html | head -1
printf 'https: '
curl -s -o /dev/null -w '%{http_code}\n' -k https://127.0.0.1/ -H 'Host: zhuopu.xuanjian.top'
printf 'download页: '
curl -s -o /dev/null -w '%{http_code}\n' -k https://127.0.0.1/download -H 'Host: zhuopu.xuanjian.top'
