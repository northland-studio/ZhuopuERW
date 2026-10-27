import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const V = '1.1.0';
const log = (m) => console.log(m);

/* 1) 根 package.json */
{
    const p = path.join(root, 'package.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = V;
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    log(`package.json = ${V}`);
}

/* 2) Electron */
{
    const p = path.join(root, 'desktop', 'electron', 'package.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = V;
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    log(`desktop/electron/package.json = ${V}`);
}

/* 3) Tauri conf */
{
    const p = path.join(root, 'desktop', 'tauri', 'src-tauri', 'tauri.conf.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = V;
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    log(`tauri.conf.json = ${V}`);
}

/* 4) Cargo.toml（Rust 包版本） */
{
    const p = path.join(root, 'desktop', 'tauri', 'src-tauri', 'Cargo.toml');
    let s = fs.readFileSync(p, 'utf8');
    s = s.replace(/^version\s*=\s*"[^"]*"/m, `version = "${V}"`);
    fs.writeFileSync(p, s, 'utf8');
    log(`Cargo.toml = ${V}`);
}

/* 5) 前端展示用：顶部标题栏版本号来自 app info，不需要改 */
