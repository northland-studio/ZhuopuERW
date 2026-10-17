import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(root, '..');
const log = (m) => console.log(m);

/* 1) 换成用户给的新字体 Times New Roman（随包，Tauri/Electron 共用） */
{
    const src = path.join(repo, '_font', 'Times_New_Roman.ttf');
    const dir = path.join(root, 'public', 'fonts');
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(dir, 'TimesNewRoman.ttf'));
        log('新字体已复制：public/fonts/TimesNewRoman.ttf');
    } else {
        log('没找到 _font/Times_New_Roman.ttf，沿用现有字体');
    }

    const cssPath = path.join(root, 'src', 'styles', 'global.css');
    let css = fs.readFileSync(cssPath, 'utf8');
    css = css.replace(
        /@font-face \{[\s\S]*?\}/,
        `@font-face {
    font-family: 'Zhuopu Serif';
    src: url('/fonts/TimesNewRoman.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
    /* 只覆盖拉丁字母与常用标点：中文继续用系统衬线，避免首屏闪烁 */
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
        U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}`
    );
    css = css.replace(
        /--font-reading:[^;]+;/,
        "--font-reading: 'Zhuopu Serif', 'Times New Roman', 'Liberation Serif', 'Songti SC', Georgia, serif;"
    );
    fs.writeFileSync(cssPath, css, 'utf8');
    log('global.css：@font-face 指向 Times New Roman');
}

/* 2) 讲评页：长难句栏隐藏答案（译文/结构分析默认收起） */
{
    const p = path.join(root, 'src', 'pages', 'ReviewDetail.tsx');
    let s = fs.readFileSync(p, 'utf8');

    // 底部栏组件里，默认隐藏 analysis/translation，句子本身可见
    s = s.replace(
        `function LongSentenceBar({ review, onJump }: { review: Review; onJump: (index: number) => void }) {`,
        `function LongSentenceBar({ review, onJump }: { review: Review; onJump: (index: number) => void }) {
    const [showAnswer, setShowAnswer] = useState(false);`
    );

    // 栏头加「显示/隐藏译文」按钮
    s = s.replace(
        `<span className="tiny muted">{total || fallback.length} 句</span>`,
        `<span className="row" style={{ gap: 10 }}>
                    <span className="tiny muted">{total || fallback.length} 句</span>
                    <button className="btn btn-sm btn-quiet" onClick={() => setShowAnswer((v) => !v)}>
                        {showAnswer ? '隐藏译文' : '显示译文'}
                    </button>
                </span>`
    );

    // 两处长难句渲染：译文与结构分析受 showAnswer 控制
    s = s.replace(
        `                                  <div className="rd-long" key={i}>
                                      <div className="rd-long-en">{s.sentence}</div>
                                      {s.analysis && <div style={{ marginTop: 6 }}>{s.analysis}</div>}
                                      {s.translation && <div style={{ marginTop: 4, color: 'var(--ink-500)' }}>{s.translation}</div>}
                                  </div>`,
        `                                  <div className="rd-long" key={i}>
                                      <div className="rd-long-en">{s.sentence}</div>
                                      {showAnswer && s.analysis && <div style={{ marginTop: 6 }}>{s.analysis}</div>}
                                      {showAnswer && s.translation && (
                                          <div style={{ marginTop: 4, color: 'var(--ink-500)' }}>{s.translation}</div>
                                      )}
                                  </div>`
    );
    s = s.replace(
        `                          <div className="rd-long" key={i}>
                              <div className="rd-long-en">{s.sentence}</div>
                              {s.analysis && <div style={{ marginTop: 6 }}>{s.analysis}</div>}
                              {s.translation && <div style={{ marginTop: 4, color: 'var(--ink-500)' }}>{s.translation}</div>}
                          </div>`,
        `                          <div className="rd-long" key={i}>
                              <div className="rd-long-en">{s.sentence}</div>
                              {showAnswer && s.analysis && <div style={{ marginTop: 6 }}>{s.analysis}</div>}
                              {showAnswer && s.translation && (
                                  <div style={{ marginTop: 4, color: 'var(--ink-500)' }}>{s.translation}</div>
                              )}
                          </div>`
    );

    fs.writeFileSync(p, s, 'utf8');
    log('ReviewDetail：长难句栏默认隐藏译文与结构分析');
}

/* 3) 导入试卷：切分后直接落库，不再需要人工确认 */
{
    const p = path.join(root, 'src', 'pages', 'ReviewDetail.tsx');
    let s = fs.readFileSync(p, 'utf8');

    const oldFlow = `            setDraft(r.draft);
            setKeep(new Set(r.draft.questions.map((_, i) => i)));
            push(\`切出 \${r.draft.passages.length} 篇原文、\${r.draft.questions.length} 道题\`, 'ok');
        } catch (e) {
            push((e as Error).message, 'bad');
        } finally {
            setBusy('');
        }
    };`;

    const newFlow = `            // 全自动：切分结果直接落库，不再要求老师勾选确认
            setDraft(r.draft);
            setKeep(new Set(r.draft.questions.map((_, i) => i)));
            const applied = await api<{ review: Review }>(\`/api/reviews/\${reviewId}/apply\`, {
                body: { passages: r.draft.passages, questions: r.draft.questions }
            });
            push(\`已导入 \${r.draft.passages.length} 篇原文、\${r.draft.questions.length} 道题\`, 'ok');
            onDone(applied.review);
        } catch (e) {
            push((e as Error).message, 'bad');
        } finally {
            setBusy('');
        }
    };`;

    if (s.includes(oldFlow)) {
        s = s.replace(oldFlow, newFlow);
        log('导入流程：切分后自动落库，无需人工确认');
    } else {
        log('导入流程：未匹配到旧代码，请手动确认');
    }

    fs.writeFileSync(p, s, 'utf8');
}
