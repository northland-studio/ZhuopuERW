import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import '../styles/home.css';

interface RecentReview {
    id: number;
    title: string;
    kind: 'review' | 'single';
    questionCount: number;
    updatedAt: string;
}

const FEATURES = [
    {
        title: '四种题型，一套讲评',
        desc: '完形填空、阅读理解、七选五、语法填空。原文与题目左右分栏，讲到哪里高亮到哪里。',
        icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2.5 3.2h6.2v9.6H2.5zM10.4 3.2h3.1v9.6h-3.1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
        )
    },
    {
        title: '重难点自动成表',
        desc: '每个题目都给出高中阶段重难点词汇与长难句，虚线下划线点开即看词性与用法。',
        icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 12.5V3.5h7.2l2.6 2.6v6.4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M5.4 8.2h4.4M5.4 10.4h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
        )
    },
    {
        title: '断网也能讲',
        desc: '讲评可以导出成 JSON 放进 review 文件夹，教室一体机断网时直接打开，联网时再同步云端。',
        icon: (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2.6v10.8M5 5.2h6M5.8 10.6h4.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
        )
    }
];

export default function Home() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { push } = useToast();
    const [recent, setRecent] = useState<RecentReview[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!user) return;
        api<{ reviews: RecentReview[] }>('/api/reviews')
            .then((r) => setRecent(r.reviews.slice(0, 4)))
            .catch(() => { /* 未登录时忽略 */ });
    }, [user]);

    const createReview = async () => {
        if (!user) { navigate('/login'); return; }
        setBusy(true);
        try {
            const r = await api<{ review: { id: number; title: string } }>('/api/reviews', {
                body: { kind: 'review' }
            });
            push(`已新建「${r.review.title}」`, 'ok');
            navigate(`/reviews/${r.review.id}`);
        } catch (e) {
            push((e as Error).message, 'bad');
        } finally {
            setBusy(false);
        }
    };

    const greetingName = user?.username || '老师';

    return (
        <div className="page">
            <section className="home-hero">
                <h1 className="home-greeting">
                    你好，<span className="accent">{greetingName}</span>！
                </h1>
                <p className="home-sub">今天准备讲哪张试卷？</p>
                <div className="home-actions">
                    <button className="btn btn-primary btn-lg" onClick={createReview} disabled={busy}>
                        {busy ? '正在创建…' : '新建讲评'}
                    </button>
                    <button className="btn btn-ghost btn-lg" onClick={() => navigate('/reviews')}>
                        我的讲评
                    </button>
                </div>
                <p className="hero-note">支持 md / txt / docx / 图片 / PDF，导入后自动切分原文与题目，再逐题生成讲评。</p>
            </section>

            <section className="home-section">
                <div className="section-head">
                    <h2 className="section-title">近期讲评</h2>
                    {user && recent.length > 0 && (
                        <button className="btn btn-sm btn-quiet" onClick={() => navigate('/reviews')}>
                            查看全部
                        </button>
                    )}
                </div>
                <div className="recent-grid">
                    {user
                        ? recent.map((r) => (
                              <button key={r.id} className="recent-card" onClick={() => navigate(`/reviews/${r.id}`)}>
                                  <div className="recent-title">{r.title}</div>
                                  <div className="recent-meta">
                                      {r.questionCount} 题 · {r.updatedAt.slice(5, 16)}
                                  </div>
                              </button>
                          ))
                        : null}
                    {user && recent.length < 4 && (
                        <button className="recent-card is-empty" onClick={createReview} disabled={busy}>
                            <span style={{ fontSize: 13.5 }}>新建讲评</span>
                        </button>
                    )}
                    {!user && (
                        <div className="recent-card is-empty" style={{ cursor: 'default' }}>
                            <span style={{ fontSize: 13.5 }}>登录后可以看到你的近期讲评</span>
                        </div>
                    )}
                </div>
            </section>

            <section className="home-section">
                <div className="section-head">
                    <h2 className="section-title">它怎么帮你</h2>
                </div>
                <div className="feature-row">
                    {FEATURES.map((f) => (
                        <div className="feature-card" key={f.title}>
                            <div className="feature-title">
                                <span className="feature-icon">{f.icon}</span>
                                {f.title}
                            </div>
                            <p className="feature-desc">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
