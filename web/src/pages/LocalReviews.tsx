import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { desktop, hasDesktop } from '../lib/desktop';
import '../styles/detail.css';

/* ---------------- 文件版讲评的 JSON 结构（与后端导出格式一致） ---------------- */

interface VocabItem { word: string; pos?: string; meanings?: string[]; usage?: string; context?: string }
interface LongSentence { sentence: string; analysis?: string; translation?: string }
interface LocalQuestion {
    type: string;
    numberLabel: string;
    stem: string;
    options: { label: string; text: string }[];
    answer: string;
    analysis?: {
        skill?: string;
        reasoning?: string;
        distractors?: { label: string; why: string }[];
        vocabulary?: VocabItem[];
        longSentences?: LongSentence[];
        optionGlosses?: { label: string; text?: string; pos?: string; meaning?: string; usage?: string }[];
        teachingTips?: string[];
    };
}
interface LocalFile {
    format?: string;
    version?: number;
    title?: string;
    kind?: 'review' | 'single';
    summary?: string;
    vocab?: VocabItem[];
    longSentences?: LongSentence[];
    passages?: { label?: string; content: string; vocabulary?: VocabItem[]; longSentences?: LongSentence[] }[];
    questions?: LocalQuestion[];
}

interface FileEntry {
    name: string;
    size: number;
    mtime: number;
    data?: LocalFile;
    parseError?: string;
}

const TYPE_LABEL: Record<string, string> = {
    cloze: '完形填空',
    reading: '阅读理解',
    seven_five: '七选五',
    grammar: '语法填空'
};

export default function LocalReviews() {
    const bridge = desktop();
    const { user } = useAuth();
    const { push } = useToast();
    const navigate = useNavigate();

    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [active, setActive] = useState<FileEntry | null>(null);
    const [openQ, setOpenQ] = useState<number | null>(null);
    const [showAnswer, setShowAnswer] = useState(false);

    const refresh = useCallback(async () => {
        if (!bridge) return;
        setLoading(true);
        try {
            const list = await bridge.review.list();
            const withData: FileEntry[] = await Promise.all(
                list.map(async (f) => {
                    try {
                        const text = await bridge.review.read(f.name);
                        if (!text) return { ...f, parseError: '文件为空' };
                        const data = JSON.parse(text) as LocalFile;
                        return { ...f, data };
                    } catch (e) {
                        return { ...f, parseError: (e as Error).message };
                    }
                })
            );
            setFiles(withData);
        } catch (e) {
            push(`读取 review 文件夹失败：${(e as Error).message}`, 'bad');
        } finally {
            setLoading(false);
        }
    }, [bridge, push]);

    useEffect(() => {
        if (hasDesktop()) void refresh();
        else setLoading(false);
    }, [refresh]);

    const remove = async (name: string) => {
        if (!bridge) return;
        if (!window.confirm(`删除本地文件 ${name}？此操作不可恢复。`)) return;
        try {
            await bridge.review.remove(name);
            push('已删除', 'ok');
            if (active?.name === name) setActive(null);
            void refresh();
        } catch (e) {
            push((e as Error).message, 'bad');
        }
    };

    const importToCloud = async (entry: FileEntry) => {
        if (!entry.data) { push('文件解析失败，无法导入', 'bad'); return; }
        if (!user) { push('请先登录后再导入云端', 'bad'); navigate('/login'); return; }
        try {
            const r = await api<{ id: number }>('/api/reviews/import', { body: { file: entry.data } });
            push('已导入到我的讲评', 'ok');
            navigate(`/reviews/${r.id}`);
        } catch (e) {
            push((e as Error).message, 'bad');
        }
    };

    /* ---------------- 非桌面环境 ---------------- */
    if (!hasDesktop()) {
        return (
            <div className="page page-narrow" style={{ paddingTop: 64 }}>
                <div className="card card-pad" style={{ textAlign: 'center', padding: 40 }}>
                    <h2 style={{ fontSize: 18, marginBottom: 10 }}>本地讲评仅在桌面客户端可用</h2>
                    <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.9 }}>
                        桌面客户端会读取程序目录下的 <code className="mono">review</code> 文件夹，
                        把讲评 JSON 放进去就能断网讲评。网页版请使用「我的讲评 → 导入 JSON」。
                    </p>
                    <button className="btn btn-primary btn-sm" style={{ marginTop: 18 }} onClick={() => navigate('/reviews')}>
                        去我的讲评
                    </button>
                </div>
            </div>
        );
    }

    const info = bridge?.info ? null : null; // 占位，避免未使用告警

    return (
        <div className="page" style={{ paddingTop: 26 }}>
            <div className="spread" style={{ marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: 26 }}>本地讲评</h1>
                    <p className="tiny muted" style={{ marginTop: 6 }}>
                        读取程序目录 <code className="mono">review</code> 文件夹里的 JSON，断网也能讲评。
                    </p>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => void refresh()} disabled={loading}>
                        {loading ? '读取中…' : '刷新'}
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => void bridge?.review.reveal()}>
                        打开文件夹
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={() => navigate('/reviews')}>
                        我的讲评
                    </button>
                </div>
            </div>

            {loading && <div className="skeleton" style={{ height: 120, borderRadius: 16 }} />}

            {!loading && files.length === 0 && (
                <div className="card card-pad" style={{ textAlign: 'center', padding: 40 }}>
                    <p className="muted" style={{ fontSize: 13.5 }}>
                        <code className="mono">review</code> 文件夹里还没有 JSON。
                    </p>
                    <p className="tiny muted" style={{ marginTop: 8, lineHeight: 1.9 }}>
                        在「我的讲评」里打开一条讲评，点「导出到本地」即可写入这个文件夹。
                    </p>
                    <button className="btn btn-sm btn-quiet" style={{ marginTop: 16 }} onClick={() => void bridge?.review.reveal()}>
                        打开 review 文件夹
                    </button>
                </div>
            )}

            {!loading && files.length > 0 && (
                <div className="stack" style={{ gap: 10 }}>
                    {files.map((f) => {
                        const qn = f.data?.questions?.length ?? 0;
                        const pn = f.data?.passages?.length ?? 0;
                        return (
                            <div key={f.name} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 220 }}>
                                    <div style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--ink-900)' }}>
                                        {f.data?.title || f.name}
                                    </div>
                                    <div className="tiny muted" style={{ marginTop: 4 }}>
                                        {f.parseError
                                            ? `无法解析：${f.parseError}`
                                            : `${pn} 篇原文 · ${qn} 题 · ${(f.size / 1024).toFixed(1)} KB`}
                                        {' · '}
                                        {new Date(f.mtime).toLocaleString()}
                                    </div>
                                </div>
                                <div className="row" style={{ gap: 6 }}>
                                    <button
                                        className="btn btn-sm btn-quiet"
                                        disabled={!!f.parseError}
                                        onClick={() => { setActive(f); setOpenQ(0); setShowAnswer(false); }}
                                    >
                                        打开
                                    </button>
                                    <button
                                        className="btn btn-sm btn-ghost"
                                        disabled={!!f.parseError}
                                        onClick={() => void importToCloud(f)}
                                    >
                                        导入云端
                                    </button>
                                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => void remove(f.name)}>
                                        删除
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {active?.data && (
                <LocalViewer
                    file={active.data}
                    openQ={openQ}
                    setOpenQ={setOpenQ}
                    showAnswer={showAnswer}
                    setShowAnswer={setShowAnswer}
                    onClose={() => setActive(null)}
                />
            )}
        </div>
    );
}

/* ---------------- 离线只读查看器 ---------------- */

function LocalViewer({
    file, openQ, setOpenQ, showAnswer, setShowAnswer, onClose
}: {
    file: LocalFile;
    openQ: number | null;
    setOpenQ: (n: number | null) => void;
    showAnswer: boolean;
    setShowAnswer: (v: boolean) => void;
    onClose: () => void;
}) {
    const [passageIdx, setPassageIdx] = useState(0);
    const passages = file.passages ?? [];
    const questions = file.questions ?? [];
    const passage = passages[passageIdx];

    const vocab = useMemo(() => {
        const map = new Map<string, VocabItem>();
        for (const v of file.vocab ?? []) if (v?.word) map.set(v.word.toLowerCase(), v);
        for (const p of passages) for (const v of p.vocabulary ?? []) if (v?.word) map.set(v.word.toLowerCase(), v);
        for (const q of questions) for (const v of q.analysis?.vocabulary ?? []) if (v?.word) map.set(v.word.toLowerCase(), v);
        return [...map.values()];
    }, [file, passages, questions]);

    return (
        <section style={{ marginTop: 26 }}>
            <div className="spread" style={{ marginBottom: 12 }}>
                <h2 style={{ fontSize: 18 }}>{file.title || '本地讲评'}</h2>
                <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-sm btn-quiet" onClick={() => setShowAnswer(!showAnswer)}>
                        {showAnswer ? '隐藏答案' : '显示答案'}
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={onClose}>关闭</button>
                </div>
            </div>

            {file.summary && (
                <p className="tiny muted" style={{ marginBottom: 14, lineHeight: 1.9 }}>{file.summary}</p>
            )}

            <div className="rd" style={{ padding: 0 }}>
                <section className="rd-panel">
                    <div className="rd-panel-head">
                        <span>阅读原文</span>
                        <span className="tag">{vocab.length} 个重点词</span>
                    </div>
                    {passages.length > 1 && (
                        <div className="rd-passage-tabs">
                            {passages.map((p, i) => (
                                <button
                                    key={i}
                                    className={`rd-passage-tab ${i === passageIdx ? 'is-active' : ''}`}
                                    onClick={() => setPassageIdx(i)}
                                >
                                    {p.label || `P${i + 1}`}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="rd-text">{passage?.content || '（没有原文）'}</div>
                </section>

                <section className="rd-panel">
                    <div className="rd-panel-head">
                        <span>题目列表（{questions.length} 题）</span>
                    </div>
                    <div className="rd-questions">
                        {questions.map((q, i) => {
                            const open = openQ === i;
                            const a = q.analysis ?? {};
                            const answer = (a as { answer?: string }).answer || q.answer || '';
                            return (
                                <div key={i} className={`rd-q ${open ? 'is-active' : ''}`}>
                                    <button className="rd-q-head" onClick={() => setOpenQ(open ? null : i)}>
                                        <span className="rd-q-num">{q.numberLabel || i + 1}</span>
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span className="tiny rd-q-stem" style={{ display: 'block', color: 'var(--ink-700)' }}>
                                                {q.stem ? q.stem.slice(0, 42) : TYPE_LABEL[q.type] || q.type}
                                            </span>
                                            <span className="rd-q-type">{TYPE_LABEL[q.type] || q.type}</span>
                                        </span>
                                    </button>

                                    {open && (
                                        <div className="rd-q-body">
                                            {q.stem && q.type === 'reading' && (
                                                <p style={{ fontSize: 14, marginTop: 12, lineHeight: 1.75 }}>{q.stem}</p>
                                            )}
                                            {q.options?.length > 0 && (
                                                <div className="rd-options-scroll" style={{ marginTop: 10 }}>
                                                    {q.options.map((o) => (
                                                        <div key={o.label} className={`rd-option ${showAnswer && o.label === answer ? 'is-answer' : ''}`}>
                                                            <span className="rd-option-label">{o.label}.</span>
                                                            <span className="rd-option-scroll">{o.text}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {showAnswer && answer && (
                                                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                                                    <span className="tag tag-ok">答案 {answer}</span>
                                                </div>
                                            )}
                                            {a.skill && (
                                                <div className="rd-block">
                                                    <div className="rd-block-title">考点</div>
                                                    <p style={{ fontSize: 13.5, fontWeight: 600 }}>{a.skill}</p>
                                                </div>
                                            )}
                                            {a.reasoning && (
                                                <div className="rd-block">
                                                    <div className="rd-block-title">讲评</div>
                                                    <p className="rd-reasoning">{a.reasoning}</p>
                                                </div>
                                            )}
                                            {!!a.distractors?.length && (
                                                <div className="rd-block">
                                                    <div className="rd-block-title">干扰项</div>
                                                    {a.distractors.map((d, k) => (
                                                        <p key={k} className="tiny" style={{ lineHeight: 1.7 }}>
                                                            <strong>{d.label}.</strong> {d.why}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                            {!!a.vocabulary?.length && (
                                                <div className="rd-block">
                                                    <div className="rd-block-title">重难点词汇</div>
                                                    <div className="rd-chips">
                                                        {a.vocabulary.map((v) => (
                                                            <span key={v.word} className="rd-vocab-chip" title={v.meanings?.join('；')}>
                                                                {v.word}
                                                                {v.pos && <em>{v.pos}</em>}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {!!a.longSentences?.length && (
                                                <div className="rd-block">
                                                    <div className="rd-block-title">长难句翻译</div>
                                                    {a.longSentences.map((s, k) => (
                                                        <div className="rd-long" key={k}>
                                                            <div className="rd-long-en">{s.sentence}</div>
                                                            {showAnswer && s.analysis && <div style={{ marginTop: 6 }}>{s.analysis}</div>}
                                                            {showAnswer && s.translation && (
                                                                <div style={{ marginTop: 4, color: 'var(--ink-500)' }}>{s.translation}</div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </section>
    );
}
