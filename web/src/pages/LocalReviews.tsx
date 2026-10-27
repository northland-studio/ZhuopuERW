import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { desktop, hasDesktop } from '../lib/desktop';
import {
    collectVocab,
    LongSentenceBar,
    PassageText,
    QuestionCard,
    VocabPopover,
    type Review,
    type Question,
    type VocabItem
} from './ReviewDetail';
import '../styles/detail.css';

/* ---------------- 文件版讲评的 JSON 结构（与后端导出格式一致） ---------------- */

interface LocalVocabItem { word: string; pos?: string; meanings?: string[]; usage?: string; context?: string }
interface LocalLong { sentence: string; analysis?: string; translation?: string }
interface LocalQuestion {
    type: string;
    numberLabel: string;
    stem: string;
    options: { label: string; text: string }[];
    answer: string;
    passageIndex?: number | null;
    analysis?: Record<string, unknown>;
}
interface LocalFile {
    format?: string;
    version?: number;
    title?: string;
    kind?: 'review' | 'single';
    summary?: string;
    vocab?: LocalVocabItem[];
    longSentences?: LocalLong[];
    passages?: { label?: string; content: string; vocabulary?: LocalVocabItem[]; longSentences?: LocalLong[] }[];
    questions?: LocalQuestion[];
}

interface FileEntry {
    name: string;
    size: number;
    mtime: number;
    data?: LocalFile;
    parseError?: string;
}

/** 把本地 JSON 映射成在线讲评页使用的 Review 结构（id 用序号占位） */
function toReview(file: LocalFile, name: string): Review {
    const passages = (file.passages ?? []).map((p, i) => ({
        id: i + 1,
        ordinal: i + 1,
        label: p.label || `P${i + 1}`,
        content: p.content,
        meta: { vocabulary: p.vocabulary ?? [], longSentences: p.longSentences ?? [] }
    }));

    const questions: Question[] = (file.questions ?? []).map((q, i) => {
        const analysis = (q.analysis ?? {}) as Question['analysis'];
        const analyzed = Object.keys(analysis).length > 0;
        return {
            id: i + 1,
            passageId: q.passageIndex ? passages[q.passageIndex - 1]?.id ?? null : passages[0]?.id ?? null,
            ordinal: i + 1,
            type: (q.type as Question['type']) ?? 'reading',
            numberLabel: q.numberLabel ?? String(i + 1),
            stem: q.stem ?? '',
            options: q.options ?? [],
            answer: q.answer ?? '',
            sourceStart: null,
            sourceEnd: null,
            analysis,
            analyzedAt: analyzed ? 'analyzed' : null
        };
    });

    return {
        id: 0,
        title: file.title || name,
        kind: file.kind ?? 'review',
        summary: file.summary ?? '',
        vocab: (file.vocab ?? []) as VocabItem[],
        longSentences: (file.longSentences ?? []) as Review['longSentences'],
        passages,
        questions
    };
}

export default function LocalReviews() {
    const bridge = useMemo(() => desktop(), []);
    const { user } = useAuth();
    const { push } = useToast();
    const navigate = useNavigate();

    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [active, setActive] = useState<FileEntry | null>(null);
    const [activeQ, setActiveQ] = useState<number | null>(null);
    const [passageIdx, setPassageIdx] = useState(0);
    const [pop, setPop] = useState<{ item: VocabItem; x: number; y: number } | null>(null);

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
                        return { ...f, data: JSON.parse(text) as LocalFile };
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
        // 只在挂载时读一次，刷新走按钮，避免循环读取
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const review = useMemo(() => (active?.data ? toReview(active.data, active.name) : null), [active]);

    useEffect(() => {
        if (review?.questions.length) setActiveQ(review.questions[0]!.id);
        setPassageIdx(0);
    }, [review]);

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

    const importToCloud = async (entry: FileEntry | null) => {
        if (!entry?.data) { push('文件解析失败，无法导入', 'bad'); return; }
        if (!user) { push('请先登录后再导入云端', 'bad'); navigate('/login'); return; }
        try {
            const r = await api<{ id: number }>('/api/reviews/import', { body: { file: entry.data } });
            push('已导入到我的讲评', 'ok');
            navigate(`/reviews/${r.id}`);
        } catch (e) {
            push((e as Error).message, 'bad');
        }
    };

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

    /* ---------------- 列表视图 ---------------- */
    if (!review) {
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
                    </div>
                )}

                {!loading && files.length > 0 && (
                    <div className="stack" style={{ gap: 10 }}>
                        {files.map((f) => (
                            <div key={f.name} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 220 }}>
                                    <div style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--ink-900)' }}>
                                        {f.data?.title || f.name}
                                    </div>
                                    <div className="tiny muted" style={{ marginTop: 4 }}>
                                        {f.parseError
                                            ? `无法解析：${f.parseError}`
                                            : `${f.data?.passages?.length ?? 0} 篇原文 · ${f.data?.questions?.length ?? 0} 题 · ${(f.size / 1024).toFixed(1)} KB`}
                                        {' · '}
                                        {new Date(f.mtime).toLocaleString()}
                                    </div>
                                </div>
                                <div className="row" style={{ gap: 6 }}>
                                    <button className="btn btn-sm btn-quiet" disabled={!!f.parseError} onClick={() => setActive(f)}>
                                        打开
                                    </button>
                                    <button className="btn btn-sm btn-ghost" disabled={!!f.parseError} onClick={() => void importToCloud(f)}>
                                        导入云端
                                    </button>
                                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => void remove(f.name)}>
                                        删除
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    /* ---------------- 离线讲评视图：与在线页同一套组件 ---------------- */
    const passage = review.passages[passageIdx] ?? review.passages[0];
    const current = review.questions.find((q) => q.id === activeQ) ?? null;
    const questionsOfPassage = review.questions.filter(
        (q) => !passage || q.passageId === passage.id || q.passageId === null
    );
    const vocabAll = collectVocab(review);

    return (
        <div className="rd">
            <header className="rd-head">
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 className="rd-title" style={{ cursor: 'default' }}>{review.title}</h1>
                    <div className="tiny muted" style={{ marginTop: 4 }}>
                        本地文件 · {review.questions.length} 题 · {review.passages.length} 篇原文 ·{' '}
                        {review.questions.filter((q) => q.analyzedAt).length} 题已讲评
                    </div>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => void bridge?.review.reveal()}>打开文件夹</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => void importToCloud(active)}>导入云端</button>
                    <button className="btn btn-sm btn-primary" onClick={() => setActive(null)}>返回列表</button>
                </div>
            </header>

            <section className="rd-panel">
                <div className="rd-panel-head">
                    <span>阅读原文</span>
                    <span className="row" style={{ gap: 8 }}>
                        {current?.sourceStart != null && <span className="tag tag-brand">已定位第 {current.numberLabel} 题</span>}
                        {vocabAll.length > 0 ? (
                            <span className="tag">{vocabAll.length} 个重点词（虚线下划线可点）</span>
                        ) : (
                            <span className="tag tag-warn">这份文件没有词汇数据</span>
                        )}
                    </span>
                </div>
                {review.passages.length > 1 && (
                    <div className="rd-passage-tabs">
                        {review.passages.map((p, i) => (
                            <button
                                key={p.id}
                                className={`rd-passage-tab ${i === passageIdx ? 'is-active' : ''}`}
                                onClick={() => setPassageIdx(i)}
                            >
                                {p.label || `P${i + 1}`}
                            </button>
                        ))}
                    </div>
                )}
                {passage ? (
                    <div className="rd-text">
                        <PassageText
                            content={passage.content}
                            highlight={current && current.passageId === passage.id ? { start: current.sourceStart, end: current.sourceEnd } : null}
                            vocab={vocabAll}
                            onVocab={(item, e) => setPop({ item, x: e.clientX, y: e.clientY })}
                        />
                    </div>
                ) : (
                    <div className="rd-empty">这份文件没有原文。</div>
                )}
            </section>

            <section className="rd-panel">
                <div className="rd-panel-head">
                    <span>题目列表（{questionsOfPassage.length} 题）</span>
                    <span className="tag">离线只读</span>
                </div>
                <div className="rd-questions">
                    {questionsOfPassage.length === 0 && <div className="rd-empty">这篇原文还没有题目。</div>}
                    {questionsOfPassage.map((q) => (
                        <QuestionCard
                            key={q.id}
                            q={q}
                            active={q.id === activeQ}
                            onSelect={() => setActiveQ(q.id)}
                            onAnalyze={() => push('离线模式下不能重新讲评，请导入云端后再讲评', 'bad')}
                            onVocab={(item, e) => setPop({ item, x: e.clientX, y: e.clientY })}
                        />
                    ))}
                </div>
            </section>

            {pop && <VocabPopover {...pop} onClose={() => setPop(null)} />}

            <LongSentenceBar review={review} onJump={(idx) => setPassageIdx(idx)} />
        </div>
    );
}

export type { LocalFile };
