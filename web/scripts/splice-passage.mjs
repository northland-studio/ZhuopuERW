/**
 * 把 ReviewDetail.tsx 里的 PassageText 组件替换成新实现（保留 VocabPopover 之后的内容）。
 * 用 Node 直接读写 UTF-8，避免 PowerShell 破坏中文。
 */
import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(import.meta.dirname, '..', 'src', 'pages', 'ReviewDetail.tsx');
const replacement = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'pages', '_passage.new.tsx'), 'utf8');

const src = fs.readFileSync(target, 'utf8');
const startMarker = 'function PassageText({';
const endMarker = 'function VocabPopover({';

const start = src.indexOf(startMarker);
const end = src.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) {
    console.error('找不到替换标记，放弃修改');
    process.exit(1);
}

// 保留 VocabPopover 前面的空行结构
const before = src.slice(0, start);
const after = src.slice(end);
const next = before + replacement.trimEnd() + '\n\n' + after;

fs.writeFileSync(target, next, 'utf8');
fs.unlinkSync(path.resolve(import.meta.dirname, '..', 'pages', '_passage.new.tsx'));
console.log(`已替换 PassageText：旧 ${src.slice(start, end).split('\n').length} 行 → 新 ${replacement.trimEnd().split('\n').length} 行`);
