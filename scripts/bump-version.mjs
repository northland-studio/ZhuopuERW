import fs from 'node:fs';
import path from 'node:path';

const V = process.argv[2];
if (!V) { console.error('用法: node scripts/bump-version.mjs 1.1.1'); process.exit(1); }

const root = path.resolve(import.meta.dirname, '..');
const log = (m) => console.log(m);

{
    const p = path.join(root, 'package.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = V;
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    log(`package.json = ${V}`);
}
{
    const p = path.join(root, 'desktop', 'electron', 'package.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = V;
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    log(`desktop/electron/package.json = ${V}`);
}
{
    const p = path.join(root, 'desktop', 'tauri', 'src-tauri', 'tauri.conf.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version = V;
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    log(`tauri.conf.json = ${V}`);
}
{
    const p = path.join(root, 'desktop', 'tauri', 'src-tauri', 'Cargo.toml');
    let s = fs.readFileSync(p, 'utf8');
    s = s.replace(/^version\s*=\s*"[^"]*"/m, `version = "${V}"`);
    fs.writeFileSync(p, s, 'utf8');
    log(`Cargo.toml = ${V}`);
}
