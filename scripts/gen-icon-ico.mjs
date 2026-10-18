/**
 * 从 web/public/brand/logo.png 生成 Tauri Windows 需要的 icon.ico
 *
 * ICO 容器可以直接内嵌 PNG 数据（Vista+ 支持 256px PNG 条目），
 * 无需外部图像库。生成单条目 256x256 的 ICO。
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'web', 'public', 'brand', 'logo.png');
const outDir = path.join(root, 'desktop', 'tauri', 'src-tauri', 'icons');
const out = path.join(outDir, 'icon.ico');

if (!fs.existsSync(src)) {
    console.error('找不到 ' + src);
    process.exit(1);
}

const png = fs.readFileSync(src);
if (png.readUInt32BE(0) !== 0x89504e47) {
    console.error('logo.png 不是合法 PNG');
    process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

// ICONDIR：保留 2 字节(0) + 类型 1 字节(1=ICO) + 数量 1 字节
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = 1 (ICO)
header.writeUInt16LE(1, 4); // count

// ICONDIRENTRY：16 字节
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);        // width = 0 表示 256
entry.writeUInt8(0, 1);        // height = 0 表示 256
entry.writeUInt8(0, 2);        // palette
entry.writeUInt8(0, 3);        // reserved
entry.writeUInt16LE(1, 4);     // color planes
entry.writeUInt16LE(32, 6);    // bits per pixel
entry.writeUInt32LE(png.length, 8); // size
entry.writeUInt32LE(22, 12);   // offset（6 + 16）

fs.writeFileSync(out, Buffer.concat([header, entry, png]));
console.log(`已生成 ${out}（${png.length + 22} 字节）`);

// 同时确认 icon.png 在位
const iconPng = path.join(outDir, 'icon.png');
if (!fs.existsSync(iconPng)) {
    fs.copyFileSync(src, iconPng);
    console.log(`已复制 ${iconPng}`);
}
