import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, download } from '../lib/api';
import { useToast } from '../lib/toast';

interface ReviewItem {
    id: number;
    title: string;
    kind: 'review' | 'single';
    questionCount: number;
    passageCount: number;
    updatedAt: string;
    status: string;
}

export default function Reviews() {
    const navigate = useNavigate();
    const { push } = useToast();
    const [items, setItems] = useState<ReviewItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [renaming, setRenaming] = useState<number | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [creating, setCreating] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const r = await api<{ reviews: ReviewItem[] }>('/api/reviews');
            setItems(r.reviews);
        } catch (e) {
            push((e as Error).message, 'bad');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const create = async (kind: 'review' | 'single') => {
        setCreating(true);
        try {
            const r = await api<{ review: { id: number } }>('/api/reviews', { body: { kind } });
            navigate(`/reviews/${r.review.id}`);
        } catch (e) {
            push((e as Error).message, 'bad');
        } finally {
            setCreating(false);
        }
    };

    const doRename = async (id: number) => {
        try {
            await api(`/api/reviews/${id}`, { method: 'PATCH', body: { title: renameValue } });
            setRenaming(null);
            push('已重命名', 'ok');
            void load();
        } catch (e) {
            push((e as Error).message, 'bad');
        }
    };

    const remove = async (id: number) => {
        if (!window.confirm('删除后无法恢复，确定删除这条讲评？')) return;
        try {
            await api(`/api/reviews/${id}`, { method: 'DELETE' });
            push('已删除', 'ok');
            void load();
        } catch (e) {
            push((e as Error).message, 'bad');
        }
    };

    const exportOne = async (item: ReviewItem) => {
        try {
            await download(`/api/reviews/${item.id}/export`, `${item.title}.json`);
            push('已导出 JSON', 'ok');
        } catch (e) {
            push((e as Error).message, 'bad');
        }
    };

    const importFile = async (file: File) => {
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const r = await api<{ id: number }>('/api/reviews/import', { body: { file: parsed } });
            push('导入成功', 'ok');
            navigate(`/reviews/${r.id}`);
        } catch (e) {
            push('导入失败：' + (e as Error).message, 'bad');
        }
    };

    const reviewList = items.filter((i) => i.kind === 'review');
    const singleList = items.filter((i) => i.kind === 'single');

    return (
        <div className="page">
            <div className="spread" style={{ marginBottom: 26, marginTop: 8 }}>
                <div>
                    <h1 style={{ fontSize: 26 }}>我的讲评</h1>
                    <p className="muted tiny" style={{ marginTop: 6 }}>
                        讲评模式（可含多篇原文）与单题临时讲评分开存放。
                    </p>
                </div>
                <div className="row" style={{ gap: 10 }}>
                    <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                        导入 JSON
                        <input
                            type="file"
                            accept="application/json,.json"
                            hidden
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void importFile(f);
                                e.target.value = '';
                            }}
                        />
                    </label>
                    <button className="btn btn-primary btn-sm" onClick={() => create('review')} disabled={creating}>
                        新建讲评
                    </button>
                </div>
            </div>

            <Section
                title="讲评"
                empty="还没有讲评。新建后用导入试卷开始，或直接粘贴文字。"
                items={reviewList}
                loading={loading}
                onCreate={() => create('review')}
                actions={{
                    open: (id) => navigate(`/reviews/${id}`),
                    rename: (item) => { setRenaming(item.id); setRenameValue(item.title); },
                    remove,
                    exportOne
                }}
            />

            <div style={{ height: 40 }} />

            <Section
                title="单题临时讲评"
                empty="临时讲评不并入讲评列表，适合课堂上临时抓一道题讲。"
                items={singleList}
                loading={loading}
                onCreate={() => create('single')}
                actions={{
                    open: (id) => navigate(`/reviews/${id}`),
                    rename: (item) => { setRenaming(item.id); setRenameValue(item.title); },
                    remove,
                    exportOne
                }}
            />

            {renaming !== null && (
                <div
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(20,16,15,0.35)', display: 'grid',
                        placeItems: 'center', zIndex: 70, backdropFilter: 'blur(3px)'
                    }}
                    onClick={() => setRenaming(null)}
                >
                    <div className="card card-pad" style={{ width: 'min(92vw, 420px)' }} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ fontSize: 17, marginBottom: 16 }}>重命名</h3>
                        <input
                            className="input"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void doRename(renaming); }}
                            autoFocus
                        />
                        <div className="row" style={{ gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>取消</button>
                            <button className="btn btn-primary btn-sm" onClick={() => void doRename(renaming)}>保存</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Section({
    title, empty, items, loading, onCreate, actions
}: {
    title: string;
    empty: string;
    items: ReviewItem[];
    loading: boolean;
    onCreate: () => void;
    actions: {
        open: (id: number) => void;
        rename: (item: ReviewItem) => void;
        remove: (id: number) => void;
        exportOne: (item: ReviewItem) => void;
    };
}) {
    return (
        <section>
            <div className="section-head">
                <h2 className="section-title">{title}</h2>
                <span className="tiny muted">{items.length} 条</span>
            </div>

            {loading && (
                <div className="stack" style={{ gap: 10 }}>
                    {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}
                </div>
            )}

            {!loading && items.length === 0 && (
                <div className="card card-pad" style={{ textAlign: 'center', padding: 36 }}>
                    <p className="muted" style={{ fontSize: 13.5 }}>{empty}</p>
                    <button className="btn btn-quiet btn-sm" style={{ marginTop: 16 }} onClick={onCreate}>立即新建</button>
                </div>
            )}

            <div className="stack" style={{ gap: 10 }}>
                {items.map((item) => (
                    <div
                        key={item.id}
                        className="card"
                        style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
                        onClick={() => actions.open(item.id)}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--ink-900)' }}>{item.title}</div>
                            <div className="tiny muted" style={{ marginTop: 4 }}>
                                {item.passageCount} 篇原文 · {item.questionCount} 题 · 更新于 {item.updatedAt.slice(5, 16)}
                            </div>
                        </div>
                        <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                            <button className="btn btn-sm btn-ghost" onClick={() => actions.exportOne(item)}>导出</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => actions.rename(item)}>重命名</button>
                            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => actions.remove(item.id)}>删除</button>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
