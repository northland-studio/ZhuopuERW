/** 把 web/dist 复制到 desktop/electron/web-dist，供 Electron 打包使用 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'web', 'dist');
const dest = path.join(root, 'desktop', 'electron', 'web-dist');

if (!fs.existsSync(src)) {
    console.error('找不到 web/dist，请先执行 pnpm --filter zhuopu-web build');
    process.exit(1);
}
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('已复制前端产物到 desktop/electron/web-dist');
