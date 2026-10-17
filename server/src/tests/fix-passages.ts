/**
 * 修库：把已有讲评里的 Markdown 残留（\41\、\_\_41\_\_、表格竖线等）清洗掉
 * 运行：node --import tsx src/tests/fix-passages.ts
 */
import { all, run } from '../db/index.js';
import { cleanMarkdown } from '../lib/markdown.js';

const rows = all<{ id: number; label: string; content: string }>('SELECT id, label, content FROM passages');

let changed = 0;
for (const r of rows) {
    const cleaned = cleanMarkdown(r.content);
    if (cleaned !== r.content) {
        run('UPDATE passages SET content = ? WHERE id = ?', cleaned, r.id);
        changed++;
        console.log(`  #${r.id} ${r.label}：${r.content.length} → ${cleaned.length} 字符`);
    }
}

// 题目里也可能有残留
const qs = all<{ id: number; stem: string }>('SELECT id, stem FROM questions WHERE stem <> \'\'');
let qChanged = 0;
for (const q of qs) {
    const cleaned = cleanMarkdown(q.stem);
    if (cleaned !== q.stem) {
        run('UPDATE questions SET stem = ? WHERE id = ?', cleaned, q.id);
        qChanged++;
    }
}

console.log(`\n清洗完成：原文 ${changed} 篇被修正，题干 ${qChanged} 道被修正（共 ${rows.length} 篇 / ${qs.length} 道）。`);
