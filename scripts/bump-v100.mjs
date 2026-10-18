import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const log = (m) => console.log(m);

/* 1) 写死 HK 后端 */
{
    const p = path.join(root, 'desktop', 'electron', 'electron', 'main.cjs');
    let s = fs.readFileSync(p, 'utf8');
    s = s.replace(
        "const API_ORIGIN = process.env.ZHUOPU_API_ORIGIN || 'https://zhuopu.xuanjian.top';",
        "const API_ORIGIN = 'https://zhuopu.xuanjian.top'; // 写死 HK 后端，不再读环境变量"
    );
    fs.writeFileSync(p, s, 'utf8');
    log('main.cjs：API_ORIGIN 写死为 https://zhuopu.xuanjian.top');
}

/* 2) Electron 版本 1.0.0 */
{
    const p = path.join(root, 'desktop', 'electron', 'package.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = '1.0.0';
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    log('electron package.json：version = 1.0.0');
}

/* 3) Tauri 版本 1.0.0 */
{
    const p = path.join(root, 'desktop', 'tauri', 'src-tauri', 'tauri.conf.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = '1.0.0';
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    log('tauri.conf.json：version = 1.0.0');
}
