import fs from 'node:fs';
import path from 'node:path';

const p = path.resolve(import.meta.dirname, '..', 'src', 'pages', 'ReviewDetail.tsx');
let s = fs.readFileSync(p, 'utf8');

/* 1) 选项区包一层横向滚动容器 */
const optionsOld = `                    {q.options.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                            {q.options.map((o) => (
                                <div key={o.label} className={\`rd-option \${showAnswer && o.label === answerLabel ? 'is-answer' : ''}\`}>
                                    <span className="rd-option-label">{o.label}.</span>
                                    <span>{o.text}</span>
                                </div>
                            ))}
                        </div>
                    )}`;

const optionsNew = `                    {q.options.length > 0 && (
                        <div className="rd-options-scroll" style={{ marginTop: 10 }}>
                            {q.options.map((o) => (
                                <div key={o.label} className={\`rd-option \${showAnswer && o.label === answerLabel ? 'is-answer' : ''}\`}>
                                    <span className="rd-option-label">{o.label}.</span>
                                    <span className="rd-option-scroll">{o.text || '（缺选项文本，可在题目里补录）'}</span>
                                </div>
                            ))}
                        </div>
                    )}`;

if (!s.includes('rd-options-scroll')) {
    s = s.replace(optionsOld, optionsNew);
    console.log('选项区：已加横向滚动容器');
} else {
    console.log('选项区：已处理过');
}

/* 2) 页面底部加「长难句汇总」栏（按原文分组），插在 importOpen 弹窗之前 */
const anchor = '            {pop && <VocabPopover {...pop} onClose={() => setPop(null)} />}';
const longbar = `            {/* 页面底部：每篇原文的长难句汇总（讲评时整篇看结构） */}
            <LongSentenceBar review={review} onJump={(idx) => setActivePassage(idx)} />

${anchor}`;

if (!s.includes('LongSentenceBar')) {
    s = s.replace(anchor, longbar);
    console.log('底部栏：已插入 LongSentenceBar');
} else {
    console.log('底部栏：已存在');
}

/* 3) 组件实现追加到文件末尾 */
if (!s.includes('function LongSentenceBar')) {
    s += `
/* ---------------- 底部：按原文分组长难句 ---------------- */

function LongSentenceBar({ review, onJump }: { review: Review; onJump: (index: number) => void }) {
    // 每篇原文的长难句来自 passages.meta.longSentences（讲评时按篇写入），
    // 没有的则回落到整份讲评的 longSentences，保证总有内容可看。
    const groups = review.passages
        .map((p, index) => {
            const meta = (p as { meta?: { longSentences?: LongSentence[] } }).meta;
            const list = meta?.longSentences?.length ? meta.longSentences : [];
            return { index, label: p.label || \`P\${index + 1}\`, list };
        })
        .filter((g) => g.list.length > 0);

    const fallback = review.longSentences ?? [];
    const total = groups.reduce((n, g) => n + g.list.length, 0);

    if (total === 0 && fallback.length === 0) {
        return (
            <section className="rd-longbar">
                <div className="rd-longbar-head">
                    <span>长难句翻译</span>
                    <span className="tiny muted">还没有长难句，点「AI 讲评全部」后按篇生成</span>
                </div>
            </section>
        );
    }

    return (
        <section className="rd-longbar">
            <div className="rd-longbar-head">
                <span>长难句翻译（按原文汇总）</span>
                <span className="tiny muted">{total || fallback.length} 句</span>
            </div>
            <div className="rd-longbar-body">
                {groups.length > 0
                    ? groups.map((g) => (
                          <div className="rd-longbar-group" key={g.index}>
                              <button
                                  className="rd-longbar-group-title"
                                  onClick={() => onJump(g.index)}
                                  style={{ padding: 0, background: 'none' }}
                                  title="跳到这篇原文"
                              >
                                  {g.label} · {g.list.length} 句
                              </button>
                              {g.list.map((s, i) => (
                                  <div className="rd-long" key={i}>
                                      <div className="rd-long-en">{s.sentence}</div>
                                      {s.analysis && <div style={{ marginTop: 6 }}>{s.analysis}</div>}
                                      {s.translation && <div style={{ marginTop: 4, color: 'var(--ink-500)' }}>{s.translation}</div>}
                                  </div>
                              ))}
                          </div>
                      ))
                    : fallback.map((s, i) => (
                          <div className="rd-long" key={i}>
                              <div className="rd-long-en">{s.sentence}</div>
                              {s.analysis && <div style={{ marginTop: 6 }}>{s.analysis}</div>}
                              {s.translation && <div style={{ marginTop: 4, color: 'var(--ink-500)' }}>{s.translation}</div>}
                          </div>
                      ))}
            </div>
        </section>
    );
}
`;
    console.log('LongSentenceBar 组件已追加');
}

fs.writeFileSync(p, s, 'utf8');
