import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, download } from '../lib/api';
import { useToast } from '../lib/toast';
import '../styles/detail.css';

/* ---------------- 类型（与后端 DTO 对齐） ---------------- */

interface Option { label: string; text: string }
interface VocabItem { word: string; pos: string; meanings: string[]; usage: string; context?: string }
interface LongSentence { sentence: string; analysis: string; translation: string }
interface OptionGloss { label: string; text: string; pos: string; meaning: string; usage: string }
interface Analysis {
    skill?: string;
    reasoning?: string;
    answer?: string;
    distractors?: { label: string; why: string }[];
    vocabulary?: VocabItem[];
    longSentences?: LongSentence[];
    optionGlosses?: OptionGloss[];
    sourceQuote?: string;
    teachingTips?: string[];
}
interface Question {
    id: number;
    passageId: number | null;
    ordinal: number;
    type: 'cloze' | 'reading' | 'seven_five' | 'grammar';
    numberLabel: string;
    stem: string;
    options: Option[];
    answer: string;
    sourceStart: number | null;
    sourceEnd: number | null;
    analysis: Analysis;
    analyzedAt: string | null;
}
interface Passage { id: number; ordinal: number; label: string; content: string }
interface Review {
    id: number;
    title: string;
    kind: 'review' | 'single';
    summary: string;
    vocab: VocabItem[];
    longSentences: LongSentence[];
    passages: Passage[];
    questions: Question[];
}

const TYPE_LABEL: Record<Question['type'], string> = {
    cloze: '完形填空',
    reading: '阅读理解',
    seven_five: '七选五',
    grammar: '语法填空'
};

export default function ReviewDetail() {
    const { id } = useParams();
    const reviewId = Number(id);
    const navigate = useNavigate();
    const { push } = useToast();

    const [review, setReview] = useState<Review | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeQ, setActiveQ] = useState<number | null>(null);
    const [activePassage, setActivePassage] = useState(0);
    const [renaming, setRenaming] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [pop, setPop] = useState<{ item: VocabItem; x: number; y: number } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await api<{ review: Review }>(`/api/reviews/${reviewId}`);
            setReview(r.review);
            setTitleDraft(r.review.title);
            if (r.review.questions.length && activeQ === null) setActiveQ(r.review.questions[0]!.id);
            if (!r.review.questions.length) setImportOpen(true);
        } catch (e) {
            push((e as Error).message, 'bad');
            navigate('/reviews', { replace: true });
        } finally {
            setLoading(false);
        }
    }, [reviewId, navigate, push, activeQ]);

    useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reviewId]);

    const current = useMemo(
        () => review?.questions.find((q) => q.id === activeQ) ?? null,
        [review, activeQ]
    );

    useEffect(() => {
        if (!current || !review) return;
        const idx = review.passages.findIndex((p) => p.id === current.passageId);
        if (idx >= 0) setActivePassage(idx);
    }, [current, review]);

    if (loading) {
        return <div className="page"><div className="skeleton" style={{ height: 320, borderRadius: 18 }} /></div>;
    }
    if (!review) return null;

    const passage = review.passages[activePassage] ?? review.passages[0];
    const questionsOfPassage = review.questions.filter(
        (q) => !passage || q.passageId === passage.id || q.passageId === null
    );

    const rename = async () => {
        try {
            await api(`/api/reviews/${review.id}`, { method: 'PATCH', body: { title: titleDraft } });
            setRenaming(false);
            setReview({ ...review, title: titleDraft });
            push('已保存标题', 'ok');
        } catch (e) {
            push((e as Error).message, 'bad');
        }
    };

    const analyzeAll = async (refresh = false) => {
        setAnalyzing(true);
        try {
            const r = await api<{ analyzed: number; tokens: number; review: Review }>(`/api/reviews/${review.id}/analyze`, {
                body: { limit: 20, refresh }
            });
            setReview(r.review);
            push(r.analyzed ? `已讲评 ${r.analyzed} 题（消耗 ${r.tokens} tokens）` : '没有需要讲评的题目', 'ok');
        } catch (e) {
            push((e as Error).message, 'bad');
        } finally {
            setAnalyzing(false);
        }
    };

    const analyzeOne = async (qid: number) => {
        try {
            const r = await api<{ review: Review }>(`/api/reviews/${review.id}/analyze`, { body: { questionIds: [qid] } });
            setReview(r.review);
        } catch (e) {
            push((e as Error).message, 'bad');
        }
    };

    const share = async () => {
        try {
            const r = await api<{ url: string }>(`/api/reviews/${review.id}/share`, { method: 'POST' });
            await navigator.clipboard.writeText(r.url).catch(() => {});
            push('分享链接已复制', 'ok');
        } catch (e) {
            push((e as Error).message, 'bad');
        }
    };

    return (
        <div className="rd">
            <header className="rd-head">
                <div style={{ flex: 1, minWidth: 0 }}>
                    {renaming ? (
                        <input
                            className="rd-title-input"
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onBlur={rename}
                            onKeyDown={(e) => { if (e.key === 'Enter') void rename(); if (e.key === 'Escape') setRenaming(false); }}
                            autoFocus
                        />
                    ) : (
                        <h1
                            className="rd-title"
                            onClick={() => setRenaming(true)}
                            title="点击重命名"
                            style={{ cursor: 'text' }}
                        >
                            {review.title}
                        </h1>
                    )}
                    <div className="tiny muted" style={{ marginTop: 4 }}>
                        {review.questions.length} 题 · {review.passages.length} 篇原文 ·{' '}
                        {review.questions.filter((q) => q.analyzedAt).length} 题已讲评
                    </div>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setImportOpen(true)}>导入试卷</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => void download(`/api/reviews/${review.id}/export`, `${review.title}.json`)}>
                        导出 JSON
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={share}>分享</button>
                    <button className="btn btn-sm btn-primary" onClick={() => analyzeAll(false)} disabled={analyzing}>
                        {analyzing ? '讲评中…' : 'AI 讲评全部'}
                    </button>
                </div>
            </header>

            {/* 左：原文 */}
            <section className="rd-panel">
                <div className="rd-panel-head">
                    <span>阅读原文</span>
                    {current?.sourceStart != null && <span className="tag tag-brand">已定位第 {current.numberLabel} 题</span>}
                </div>
                {review.passages.length > 1 && (
                    <div className="rd-passage-tabs">
                        {review.passages.map((p, i) => (
                            <button
                                key={p.id}
                                className={`rd-passage-tab ${i === activePassage ? 'is-active' : ''}`}
                                onClick={() => setActivePassage(i)}
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
                            vocab={collectVocab(review)}
                            onVocab={(item, e) => setPop({ item, x: e.clientX, y: e.clientY })}
                        />
                    </div>
                ) : (
                    <div className="rd-empty">还没有原文，点右上角「导入试卷」开始。</div>
                )}
            </section>

            {/* 右：题目 */}
            <section className="rd-panel">
                <div className="rd-panel-head">
                    <span>题目列表（{questionsOfPassage.length} 题）</span>
                    <button className="btn btn-sm btn-quiet" onClick={() => analyzeAll(true)} disabled={analyzing}>
                        重新生成
                    </button>
                </div>
                <div className="rd-questions">
                    {questionsOfPassage.length === 0 && <div className="rd-empty">这篇原文还没有题目。</div>}
                    {questionsOfPassage.map((q) => (
                        <QuestionCard
                            key={q.id}
                            q={q}
                            active={q.id === activeQ}
                            onSelect={() => setActiveQ(q.id)}
                            onAnalyze={() => analyzeOne(q.id)}
                            onVocab={(item, e) => setPop({ item, x: e.clientX, y: e.clientY })}
                        />
                    ))}
                </div>
            </section>

            {/* 页面底部：每篇原文的长难句汇总（讲评时整篇看结构） */}
            <LongSentenceBar review={review} onJump={(idx) => setActivePassage(idx)} />

            {pop && <VocabPopover {...pop} onClose={() => setPop(null)} />}

            {importOpen && (
                <ImportModal
                    reviewId={review.id}
                    hasContent={review.questions.length > 0}
                    onClose={() => setImportOpen(false)}
                    onDone={(r) => { setReview(r); setImportOpen(false); setActiveQ(r.questions[0]?.id ?? null); }}
                />
            )}
        </div>
    );
}

/* ---------------- 原文渲染：高亮 + 词汇虚线下划线 ---------------- */

function collectVocab(review: Review): VocabItem[] {
    const map = new Map<string, VocabItem>();
    // 长文本常见情况：只有部分题目讲评过，词汇散在不同篇里。
    // 这里统一取「整份讲评」的词汇并集，保证任何一篇原文都能看到勾画。
    const related = review.questions;
    for (const q of related) {
        for (const v of q.analysis?.vocabulary ?? []) {
            const key = v.word.toLowerCase();
            if (!map.has(key) && v.word.length > 1) map.set(key, v);
        }
    }
    for (const v of review.vocab ?? []) {
        const key = v.word.toLowerCase();
        if (!map.has(key) && v.word.length > 1) map.set(key, v);
    }
    return [...map.values()];
}

function PassageText({
    content, highlight, vocab, onVocab
}: {
    content: string;
    highlight: { start: number | null; end: number | null } | null;
    vocab: VocabItem[];
    onVocab: (item: VocabItem, e: React.MouseEvent) => void;
}) {
    /**
     * 一次性算出「分段」：每段带两件事——属于哪个词汇、是否落在当前题的高亮区间。
     *
     * 这里不能先渲染成节点再按偏移切割：之前那样切会把词汇 span 的 onClick 丢掉，
     * 导致点了虚线下划线没反应（只有未高亮时能点）。分段渲染可以同时保住高亮与点击。
     */
    const segments = useMemo(() => {
        const marks: { start: number; end: number; item: VocabItem }[] = [];
        // 词汇匹配：长词优先，避免 heritage 被 herit 抢先
        const sorted = [...vocab].sort((a, b) => b.word.length - a.word.length);
        for (const v of sorted) {
            const escaped = v.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`\\b${escaped}(?:s|es|ed|d|ing|ly)?\\b`, 'gi');
            let m: RegExpExecArray | null;
            while ((m = re.exec(content))) {
                const start = m.index;
                const end = start + m[0].length;
                if (marks.some((x) => start < x.end && end > x.start)) continue;
                marks.push({ start, end, item: v });
            }
        }
        marks.sort((a, b) => a.start - b.start);

        const hlStart = highlight?.start ?? null;
        const hlEnd = highlight?.end ?? null;
        const hl = hlStart != null && hlEnd != null && hlEnd > hlStart ? { start: hlStart, end: hlEnd } : null;

        // 所有需要断开的位置：词汇边界 + 高亮边界 + 首尾
        const cuts = new Set<number>([0, content.length]);
        for (const mk of marks) { cuts.add(mk.start); cuts.add(mk.end); }
        if (hl) { cuts.add(Math.max(0, hl.start)); cuts.add(Math.min(content.length, hl.end)); }
        const points = [...cuts].filter((p) => p >= 0 && p <= content.length).sort((a, b) => a - b);

        const out: { text: string; item?: VocabItem; highlighted: boolean }[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i]!;
            const b = points[i + 1]!;
            if (b <= a) continue;
            const mark = marks.find((mk) => mk.start < b && mk.end > a);
            const highlighted = !!hl && a >= hl.start && a < hl.end;
            out.push({ text: content.slice(a, b), item: mark?.item, highlighted });
        }
        return out;
    }, [content, vocab, highlight]);

    return (
        <>
            {segments.map((seg, i) => {
                const inner = seg.item ? (
                    <span
                        key={`v${i}`}
                        className="rd-vocab"
                        onClick={(e) => onVocab(seg.item!, e)}
                        title={`${seg.item.word} ${seg.item.pos}`.trim()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                const rect = (e.target as HTMLElement).getBoundingClientRect();
                                onVocab(seg.item!, { clientX: rect.left, clientY: rect.bottom } as React.MouseEvent);
                            }
                        }}
                    >
                        {seg.text}
                    </span>
                ) : (
                    <Fragment key={`t${i}`}>{seg.text}</Fragment>
                );
                return seg.highlighted ? <mark key={`m${i}`}>{inner}</mark> : <Fragment key={`s${i}`}>{inner}</Fragment>;
            })}
        </>
    );
}

function VocabPopover({ item, x, y, onClose }: { item: VocabItem; x: number; y: number; onClose: () => void }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onEsc);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
    }, [onClose]);

    const left = Math.min(Math.max(12, x - 40), window.innerWidth - 356);
    const top = Math.min(y + 14, window.innerHeight - 240);

    return (
        <div className="rd-popover" style={{ left, top }} ref={ref}>
            <div>
                <span className="rd-pop-word">{item.word}</span>
                {item.pos && <span className="rd-pop-pos">{item.pos}</span>}
            </div>
            {item.meanings?.length > 0 && (
                <div className="rd-pop-mean">{item.meanings.join('；')}</div>
            )}
            {item.usage && <div className="rd-pop-usage">{item.usage}</div>}
            {item.context && <div className="rd-pop-usage" style={{ borderTop: 'none', paddingTop: 4 }}>{item.context}</div>}
        </div>
    );
}

/* ---------------- 单个题目卡片 ---------------- */

function QuestionCard({
    q, active, onSelect, onAnalyze, onVocab
}: {
    q: Question;
    active: boolean;
    onSelect: () => void;
    onAnalyze: () => void;
    onVocab: (item: VocabItem, e: React.MouseEvent) => void;
}) {
    const [open, setOpen] = useState(false);
    const [showAnswer, setShowAnswer] = useState(false);
    const a = q.analysis ?? {};
    const answerLabel = (a.answer || q.answer || '').trim();

    return (
        <div className={`rd-q ${active ? 'is-active' : ''}`}>
            <button className="rd-q-head" onClick={() => { onSelect(); setOpen((v) => !v); }}>
                <span className="rd-q-num">{q.numberLabel || q.ordinal}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="tiny rd-q-stem" style={{ display: 'block', color: 'var(--ink-700)' }}>
                        {q.stem ? q.stem.slice(0, 42) : TYPE_LABEL[q.type]}
                    </span>
                    <span className="rd-q-type">{TYPE_LABEL[q.type]}{q.analyzedAt ? ' · 已讲评' : ' · 待讲评'}</span>
                </span>
                <span style={{ color: 'var(--ink-300)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                </span>
            </button>

            {open && (
                <div className="rd-q-body">
                    {q.stem && q.type === 'reading' && (
                        <p style={{ fontSize: 14, marginTop: 12, lineHeight: 1.75 }}>{q.stem}</p>
                    )}

                    {q.options.length > 0 && (
                        <div className="rd-options-scroll" style={{ marginTop: 10 }}>
                            {q.options.map((o) => (
                                <div key={o.label} className={`rd-option ${showAnswer && o.label === answerLabel ? 'is-answer' : ''}`}>
                                    <span className="rd-option-label">{o.label}.</span>
                                    <span className="rd-option-scroll">{o.text || '（缺选项文本，可在题目里补录）'}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-quiet" onClick={() => setShowAnswer((v) => !v)}>
                            {showAnswer ? '隐藏答案' : '查看答案'}
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={onAnalyze}>
                            {q.analyzedAt ? '重新讲评' : 'AI 讲评'}
                        </button>
                        {showAnswer && answerLabel && <span className="tag tag-ok">答案 {answerLabel}</span>}
                    </div>

                    {/* 长难句翻译：紧跟在选项 / 答案区（对照组双框）下面 */}
                    {!!a.longSentences?.length && (
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
                            <div className="stack" style={{ gap: 6 }}>
                                {a.distractors.map((d) => (
                                    <p key={d.label} className="tiny" style={{ lineHeight: 1.7 }}>
                                        <strong style={{ color: 'var(--ink-700)' }}>{d.label}.</strong> {d.why}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}

                    {!!a.optionGlosses?.length && (
                        <div className="rd-block">
                            <div className="rd-block-title">选项词汇</div>
                            <div className="stack" style={{ gap: 6 }}>
                                {a.optionGlosses.map((g) => (
                                    <p key={g.label} className="tiny" style={{ lineHeight: 1.7 }}>
                                        <strong style={{ color: 'var(--ink-700)' }}>{g.label}. {g.text}</strong>
                                        {g.pos ? ` ${g.pos}` : ''} — {g.meaning}
                                        {g.usage ? <span className="muted">（{g.usage}）</span> : null}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}

                    {!!a.vocabulary?.length && (
                        <div className="rd-block">
                            <div className="rd-block-title">重难点词汇</div>
                            <div className="rd-chips">
                                {a.vocabulary.map((v) => (
                                    <button key={v.word} className="rd-vocab-chip" onClick={(e) => onVocab(v, e)}>
                                        {v.word}
                                        {v.pos && <em>{v.pos}</em>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}


                    {!!a.teachingTips?.length && (
                        <div className="rd-block">
                            <div className="rd-block-title">教学建议</div>
                            <ul className="stack" style={{ gap: 4 }}>
                                {a.teachingTips.map((t, i) => (
                                    <li key={i} className="tiny" style={{ lineHeight: 1.7 }}>· {t}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {!a.skill && !q.analyzedAt && (
                        <p className="tiny muted" style={{ marginTop: 12 }}>还没有讲评内容，点「AI 讲评」生成。</p>
                    )}
                </div>
            )}
        </div>
    );
}

/* ---------------- 导入试卷 ---------------- */

function ImportModal({
    reviewId, hasContent, onClose, onDone
}: {
    reviewId: number;
    hasContent: boolean;
    onClose: () => void;
    onDone: (r: Review) => void;
}) {
    const { push } = useToast();
    const [tab, setTab] = useState<'upload' | 'paste'>('upload');
    const [text, setText] = useState('');
    const [type, setType] = useState<Question['type'] | ''>('');
    const [busy, setBusy] = useState('');
    const [draft, setDraft] = useState<{ passages: { label: string; content: string }[]; questions: Question[]; notes: string } | null>(null);
    const [keep, setKeep] = useState<Set<number>>(new Set());
    const [over, setOver] = useState(false);

    const upload = async (file: File) => {
        setBusy('正在解析文件…');
        try {
            const form = new FormData();
            form.append('file', file);
            const r = await api<{ ok: boolean; text: string; source: string; note: string }>('/api/upload/file', { form });
            setText(r.text);
            push(`${r.note || '解析完成'}（${r.text.length} 字符）`, 'ok');
            setTab('paste');
        } catch (e) {
            push((e as Error).message, 'bad');
        } finally {
            setBusy('');
        }
    };

    const split = async () => {
        if (text.trim().length < 10) { push('请先提供试卷内容', 'bad'); return; }
        setBusy('正在切分原文与题目…');
        try {
            const r = await api<{ draft: { passages: { label: string; content: string }[]; questions: Question[]; notes: string } }>(
                `/api/reviews/${reviewId}/split`,
                { body: { text, type: type || undefined } }
            );
            setDraft(r.draft);
            setKeep(new Set(r.draft.questions.map((_, i) => i)));
            push(`切出 ${r.draft.passages.length} 篇原文、${r.draft.questions.length} 道题`, 'ok');
        } catch (e) {
            push((e as Error).message, 'bad');
        } finally {
            setBusy('');
        }
    };

    const apply = async () => {
        if (!draft) return;
        setBusy('正在保存…');
        try {
            const questions = draft.questions.filter((_, i) => keep.has(i));
            const r = await api<{ review: Review }>(`/api/reviews/${reviewId}/apply`, {
                body: { passages: draft.passages, questions }
            });
            push('已导入', 'ok');
            onDone(r.review);
        } catch (e) {
            push((e as Error).message, 'bad');
        } finally {
            setBusy('');
        }
    };

    return (
        <div className="rd-modal" onClick={onClose}>
            <div className="rd-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="spread" style={{ marginBottom: 18 }}>
                    <h2 style={{ fontSize: 19 }}>导入试卷</h2>
                    <button className="btn btn-sm btn-ghost" onClick={onClose}>关闭</button>
                </div>

                {!draft && (
                    <>
                        <div className="row" style={{ gap: 8, marginBottom: 16 }}>
                            <button className={`btn btn-sm ${tab === 'upload' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('upload')}>上传文件</button>
                            <button className={`btn btn-sm ${tab === 'paste' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('paste')}>粘贴文字</button>
                        </div>

                        {tab === 'upload' ? (
                            <>
                                <label
                                    className={`rd-drop ${over ? 'is-over' : ''}`}
                                    style={{ display: 'block', cursor: 'pointer' }}
                                    onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                                    onDragLeave={() => setOver(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setOver(false);
                                        const f = e.dataTransfer.files?.[0];
                                        if (f) void upload(f);
                                    }}
                                >
                                    <input
                                        type="file"
                                        hidden
                                        accept=".md,.markdown,.txt,.docx,.pdf,.png,.jpg,.jpeg,.webp"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) void upload(f);
                                            e.target.value = '';
                                        }}
                                    />
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 6 }}>
                                        点击选择文件，或拖到这里
                                    </div>
                                    <div>支持 md / txt / docx / PDF / 图片（拍照件走 OCR）</div>
                                </label>
                                <p className="tiny muted" style={{ marginTop: 12 }}>
                                    图片会直接上传到七牛，docx 与 PDF 会先取公开地址再交给 MinerU 转文字。
                                </p>
                            </>
                        ) : (
                            <label className="field">
                                <span className="field-label">试卷原文（含题号与选项）</span>
                                <textarea
                                    className="input textarea"
                                    style={{ minHeight: 220 }}
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="把整份试卷的文字粘贴进来，包含题号、选项与答案（有就带上）"
                                />
                            </label>
                        )}

                        <div className="row" style={{ gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                            <label className="field" style={{ flex: '0 0 auto' }}>
                                <span className="field-label">优先题型</span>
                                <select
                                    className="input"
                                    value={type}
                                    onChange={(e) => setType(e.target.value as Question['type'] | '')}
                                    style={{ width: 160 }}
                                >
                                    <option value="">自动判断</option>
                                    <option value="cloze">完形填空</option>
                                    <option value="reading">阅读理解</option>
                                    <option value="seven_five">七选五</option>
                                    <option value="grammar">语法填空</option>
                                </select>
                            </label>
                            <div style={{ flex: 1 }} />
                            <button className="btn btn-primary" onClick={split} disabled={!!busy}>
                                {busy || '开始切分'}
                            </button>
                        </div>
                        {busy && <p className="tiny muted" style={{ marginTop: 10 }}>{busy}</p>}
                    </>
                )}

                {draft && (
                    <>
                        <p className="tiny muted" style={{ marginBottom: 12 }}>
                            共 {draft.passages.length} 篇原文、{draft.questions.length} 道题。
                            取消勾选可以丢弃切错的题目；{hasContent ? '保存后会覆盖当前原文与题目。' : ''}
                        </p>
                        {draft.notes && (
                            <p className="tiny" style={{ marginBottom: 12, color: 'var(--warn)' }}>模型提示：{draft.notes}</p>
                        )}
                        <div className="stack" style={{ gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                            {draft.questions.map((q, i) => (
                                <label key={i} className="rd-preview-q">
                                    <input
                                        type="checkbox"
                                        checked={keep.has(i)}
                                        onChange={(e) => {
                                            const next = new Set(keep);
                                            if (e.target.checked) next.add(i); else next.delete(i);
                                            setKeep(next);
                                        }}
                                        style={{ marginTop: 3 }}
                                    />
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ fontWeight: 700, marginRight: 6 }}>{q.numberLabel}</span>
                                        <span className="tiny muted">{TYPE_LABEL[q.type]}</span>
                                        <span className="tiny" style={{ display: 'block', marginTop: 2 }}>
                                            {q.stem?.slice(0, 60) || q.options.map((o) => `${o.label}.${o.text}`).join('  ').slice(0, 60)}
                                        </span>
                                    </span>
                                    {q.answer && <span className="tag tag-ok">{q.answer}</span>}
                                </label>
                            ))}
                        </div>
                        <div className="row" style={{ gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>返回修改</button>
                            <button className="btn btn-primary btn-sm" onClick={apply} disabled={!!busy || keep.size === 0}>
                                保存 {keep.size} 道题
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/* ---------------- 底部：按原文分组长难句 ---------------- */

function LongSentenceBar({ review, onJump }: { review: Review; onJump: (index: number) => void }) {
    // 每篇原文的长难句来自 passages.meta.longSentences（讲评时按篇写入），
    // 没有的则回落到整份讲评的 longSentences，保证总有内容可看。
    const groups = review.passages
        .map((p, index) => {
            const meta = (p as { meta?: { longSentences?: LongSentence[] } }).meta;
            const list = meta?.longSentences?.length ? meta.longSentences : [];
            return { index, label: p.label || `P${index + 1}`, list };
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
