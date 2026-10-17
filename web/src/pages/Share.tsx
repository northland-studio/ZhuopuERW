import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

interface SharedFile {
    title: string;
    kind: 'review' | 'single';
    summary: string;
    passages: { label: string; content: string }[];
    questions: {
        type: string;
        numberLabel: string;
        stem: string;
        options: { label: string; text: string }[];
        answer: string;
    }[];
}

export default function Share() {
    const { token } = useParams();
    const { user } = useAuth();
    const { push } = useToast();
    const navigate = useNavigate();
    const [file, setFile] = useState<SharedFile | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api<{ file: SharedFile }>(`/api/share/${token}`)
            .then((r) => setFile(r.file))
            .catch((e) => setError((e as Error).message));
    }, [token]);

    const importIt = async () => {
        if (!user) { navigate('/login'); return; }
        setBusy(true);
        try {
            const raw = await api<{ file: unknown }>(`/api/share/${token}`);
            const r = await api<{ id: number }>('/api/reviews/import', { body: { file: raw.file } });
            push('已导入到我的讲评', 'ok');
            navigate(`/reviews/${r.id}`);
        } catch (e) {
            push((e as Error).message, 'bad');
        } finally {
            setBusy(false);
        }
    };

    if (error) {
        return (
            <div className="page page-narrow" style={{ paddingTop: 72 }}>
                <div className="card card-pad" style={{ textAlign: 'center', padding: 40 }}>
                    <p className="muted">{error}</p>
                </div>
            </div>
        );
    }

    if (!file) {
        return <div className="page page-narrow"><div className="skeleton" style={{ height: 240, marginTop: 40 }} /></div>;
    }

    return (
        <div className="page page-narrow" style={{ paddingTop: 48 }}>
            <p className="tiny muted" style={{ marginBottom: 10 }}>其他老师分享的讲评</p>
            <h1 style={{ fontSize: 26, marginBottom: 8 }}>{file.title}</h1>
            <p className="tiny muted" style={{ marginBottom: 22 }}>
                {file.passages.length} 篇原文 · {file.questions.length} 道题
            </p>
            {file.summary && <p style={{ fontSize: 14, lineHeight: 1.9, marginBottom: 22 }}>{file.summary}</p>}

            <button className="btn btn-primary" onClick={importIt} disabled={busy}>
                {busy ? '导入中…' : '导入到我的讲评'}
            </button>

            <section className="card card-pad" style={{ marginTop: 28 }}>
                <h2 style={{ fontSize: 15, marginBottom: 12 }}>题目预览</h2>
                <div className="stack" style={{ gap: 8 }}>
                    {file.questions.slice(0, 20).map((q, i) => (
                        <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                            <span className="mono" style={{ flex: '0 0 32px', color: 'var(--brand-700)' }}>{q.numberLabel}</span>
                            <span className="tiny" style={{ flex: 1 }}>
                                {q.stem || q.options.map((o) => `${o.label}.${o.text}`).join('  ')}
                            </span>
                            {q.answer && <span className="tag tag-ok">{q.answer}</span>}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
