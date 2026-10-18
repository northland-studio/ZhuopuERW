import fs from 'node:fs';
import path from 'node:path';

const p = path.resolve(import.meta.dirname, '..', 'electron', 'main.cjs');
let s = fs.readFileSync(p, 'utf8');

// 静态响应补 CORS 与 MIME 嗅探保护：
// Vite 产物里的 <script type="module" crossorigin> 会以 CORS 模式请求，
// 本地服务不返回 Access-Control-Allow-Origin 时模块脚本会被拦掉（表现就是白屏、且 Console 无报错）。
if (!s.includes('Access-Control-Allow-Origin')) {
    s = s.replace(
        `        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });`,
        `        res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-cache'
        });`
    );
    s = s.replace(
        `                    res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(html);`,
        `                    res.writeHead(200, {
                        'Content-Type': MIME['.html'],
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-cache'
                    }).end(html);`
    );
    fs.writeFileSync(p, s, 'utf8');
    console.log('本地静态服务器：已补 CORS / CORP / nosniff 响应头');
} else {
    console.log('已存在 CORS 头，跳过');
}
