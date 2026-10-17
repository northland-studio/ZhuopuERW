import fs from 'node:fs';
import path from 'node:path';

const p = path.resolve(import.meta.dirname, '..', 'src', 'pages', 'ReviewDetail.tsx');
let s = fs.readFileSync(p, 'utf8');

const block = `                    {!!a.longSentences?.length && (
                        <div className="rd-block">
                            <div className="rd-block-title">长难句翻译</div>
                            {a.longSentences.map((s, i) => (
                                <div className="rd-long" key={i}>
                                    <div className="rd-long-en">{s.sentence}</div>
                                    {s.analysis && <div style={{ marginTop: 6 }}>{s.analysis}</div>}
                                    {s.translation && <div style={{ marginTop: 4, color: 'var(--ink-500)' }}>{s.translation}</div>}
                                </div>
                            ))}
                        </div>
                    )}
`;

const first = s.indexOf(block);
const second = s.indexOf(block, first + block.length);
if (first < 0) {
    console.log('没找到长难句块');
    process.exit(1);
}
if (second < 0) {
    console.log('只有一份长难句块，无需去重');
    process.exit(0);
}
s = s.slice(0, second) + s.slice(second + block.length);
fs.writeFileSync(p, s, 'utf8');
console.log('已删除重复的长难句块（保留选项区下方那份）');
