import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

const rootPkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8'));

export default defineConfig({
    plugins: [react()],
    define: {
        // 版本号从根 package.json 注入，下载页直接用同一版本拼 CDN 直链
        __APP_VERSION__: JSON.stringify(rootPkg.version),
        // 桌面端安装包在七牛上的位置
        __CDN_BASE__: JSON.stringify('https://cdn.zp.xuanjian.top/zhuopu')
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:3901',
                changeOrigin: false,
                cookieDomainRewrite: 'localhost'
            }
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
        target: 'es2020'
    }
});
