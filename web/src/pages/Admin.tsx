import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

interface Usage {
    daily: { day: string; calls: number; prompt: number; completion: number; total: number }[];
    byModel: { provider: string; model: string; calls: number; total: number }[];
    byPurpose: { purpose: string; calls: number; total: number }[];
    topUsers: { user_id: number; username: string; email: string; calls: number; total: number }[];
    recentErrors: { created_at: string; provider: string; model: string; error: string }[];
}

interface Overview {
    users: number; sets: number; questions: number; analyzed: number;
    tokens: { today: number; last7d: number; total: number };
    calls: number; failed: number;
    providers: { provider: string; model: string; configured: boolean }[];
    mail: { user: string; lastOkAt: string; lastError: string; lastErrorAt: string };
    qiniu: { bucket: string; domain: string; configured: boolean };
    mineru: { configured: boolean; model: string };
}

export default function Admin() {
    const { user } = useAuth();
    const { push } = useToast();
    const [tab, setTab] = useState<'usage' | 'settings' | 'codes'>('usage');
    const [overview, setOverview] = useState<Overview | null>(null);
    const [usage, setUsage] = useState<Usage | null>(null);
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [secrets, setSecrets] = useState<Record<string, string>>({});
    const [codes, setCodes] = useState<{ batch: string; codes: string[] } | null>(null);

    useEffect(() => {
        if (user?.role !== 'admin') return;
        void api<Overview>('/api/admin/overview').then(setOverview).catch((e) => push((e as Error).message, 'bad'));
        void api<Usage>('/api/admin/usage?days=14').then(setUsage).catch(() => {});
        void api<{ settings: Record<string, string>; secrets: Record<string, string> }>('/api/admin/settings')
            .then((r) => { setSettings(r.settings); setSecrets(r.secrets); })
            .catch(() => {});
    }, [user, push]);

    if (user?.role !== 'admin') {
        return <div className="page page-narrow" style={{ paddingTop: 60 }}><p className="muted">需要管理员权限。</p></div>;
    }

    return (
        <div className="page" style={{ paddingTop: 28 }}>
            <h1 style={{ fontSize: 26, marginBottom: 6 }}>管理后台</h1>
            <p className="tiny muted" style={{ marginBottom: 24 }}>token 吞吐、模型与 Key、激活码。</p>

            <div className="row" style={{ gap: 8, marginBottom: 22 }}>
                {([['usage', '吞吐统计'], ['settings', '模型设置'], ['codes', '激活码']] as const).map(([k, label]) => (
                    <button key={k} className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(k)}>
                        {label}
                    </button>
                ))}
            </div>

            {overview && (
                <div className="feature-row" style={{ marginBottom: 24 }}>
                    {[
                        ['用户', String(overview.users)],
                        ['讲评', String(overview.sets)],
                        ['题目', `${overview.questions}（已讲评 ${overview.analyzed}）`],
                        ['今日 tokens', overview.tokens.today.toLocaleString()],
                        ['7 日 tokens', overview.tokens.last7d.toLocaleString()],
                        ['累计 tokens', overview.tokens.total.toLocaleString()]
                    ].map(([k, v]) => (
                        <div className="feature-card" key={k}>
                            <div className="tiny muted">{k}</div>
                            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{v}</div>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'usage' && usage && (
                <>
                    <section className="card card-pad" style={{ marginBottom: 18 }}>
                        <h2 style={{ fontSize: 16, marginBottom: 14 }}>按日（近 {usage.daily.length} 天）</h2>
                        <div className="stack" style={{ gap: 6 }}>
                            {usage.daily.map((d) => {
                                const max = Math.max(...usage.daily.map((x) => x.total), 1);
                                return (
                                    <div key={d.day} className="row" style={{ gap: 10 }}>
                                        <span className="mono" style={{ flex: '0 0 84px', color: 'var(--ink-500)' }}>{d.day.slice(5)}</span>
                                        <div style={{ flex: 1, height: 8, background: 'var(--ink-100)', borderRadius: 99, overflow: 'hidden' }}>
                                            <div style={{ width: `${(d.total / max) * 100}%`, height: '100%', background: 'var(--brand)' }} />
                                        </div>
                                        <span className="mono" style={{ flex: '0 0 84px', textAlign: 'right' }}>{d.total.toLocaleString()}</span>
                                    </div>
                                );
                            })}
                            {usage.daily.length === 0 && <p className="muted tiny">还没有调用记录。</p>}
                        </div>
                    </section>

                    <div className="feature-row">
                        <div className="feature-card">
                            <div className="feature-title">按模型</div>
                            <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                                {usage.byModel.map((m) => (
                                    <div key={`${m.provider}-${m.model}`} className="row spread tiny">
                                        <span>{m.provider} / {m.model}</span>
                                        <span className="mono">{m.total.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="feature-card">
                            <div className="feature-title">按用途</div>
                            <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                                {usage.byPurpose.map((p) => (
                                    <div key={p.purpose || 'unknown'} className="row spread tiny">
                                        <span>{p.purpose || '未标记'}</span>
                                        <span className="mono">{p.total.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="feature-card">
                            <div className="feature-title">消耗最多的用户</div>
                            <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                                {usage.topUsers.map((u) => (
                                    <div key={u.user_id ?? 0} className="row spread tiny">
                                        <span>{u.username || u.email || '未知'}</span>
                                        <span className="mono">{u.total.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {usage.recentErrors.length > 0 && (
                        <section className="card card-pad" style={{ marginTop: 18 }}>
                            <h2 style={{ fontSize: 16, marginBottom: 10 }}>最近的失败调用</h2>
                            <div className="stack" style={{ gap: 6 }}>
                                {usage.recentErrors.map((e, i) => (
                                    <p key={i} className="tiny" style={{ color: 'var(--danger)' }}>
                                        {e.created_at} · {e.provider}/{e.model} · {e.error.slice(0, 120)}
                                    </p>
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}

            {tab === 'settings' && (
                <SettingsPanel
                    settings={settings}
                    secrets={secrets}
                    onSaved={(s) => { setSettings(s); push('已保存', 'ok'); }}
                />
            )}

            {tab === 'codes' && (
                <section className="card card-pad">
                    <h2 style={{ fontSize: 16, marginBottom: 6 }}>激活码（仅预留，不拦截使用）</h2>
                    <p className="tiny muted" style={{ marginBottom: 16 }}>
                        这里生成的激活码会记入数据库，后续要开启校验时只需把设置里的开关打开。
                    </p>
                    <div className="row" style={{ gap: 10 }}>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={async () => {
                                try {
                                    const r = await api<{ batch: string; codes: string[] }>('/api/admin/activation-codes', {
                                        body: { count: 10 }
                                    });
                                    setCodes(r);
                                    push(`已生成 ${r.codes.length} 个（批次 ${r.batch}）`, 'ok');
                                } catch (e) {
                                    push((e as Error).message, 'bad');
                                }
                            }}
                        >
                            生成 10 个
                        </button>
                    </div>
                    {codes && (
                        <div className="mono" style={{ marginTop: 16, lineHeight: 2 }}>
                            {codes.codes.map((c) => <div key={c}>{c}</div>)}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}

function SettingsPanel({
    settings, secrets, onSaved
}: {
    settings: Record<string, string>;
    secrets: Record<string, string>;
    onSaved: (s: Record<string, string>) => void;
}) {
    const { push } = useToast();
    const [local, setLocal] = useState(settings);
    const [key1, setKey1] = useState('');
    const [key2, setKey2] = useState('');

    useEffect(() => setLocal(settings), [settings]);

    const save = async () => {
        try {
            await api('/api/admin/settings', {
                method: 'PUT',
                body: { ...local, deepseekKey: key1 || undefined, glmKey: key2 || undefined }
            });
            setKey1('');
            setKey2('');
            onSaved(local);
        } catch (e) {
            push((e as Error).message, 'bad');
        }
    };

    const test = async (provider: 'deepseek' | 'glm') => {
        try {
            const r = await api<{ ok: boolean; model: string; latencyMs: number }>('/api/admin/settings/test-provider', {
                body: { provider }
            });
            push(`${provider} 连接正常（${r.model}，${r.latencyMs}ms）`, 'ok');
        } catch (e) {
            push((e as Error).message, 'bad');
        }
    };

    return (
        <section className="card card-pad">
            <h2 style={{ fontSize: 16, marginBottom: 16 }}>模型与密钥</h2>
            <div className="stack" style={{ gap: 16, maxWidth: 620 }}>
                <label className="field">
                    <span className="field-label">默认模型</span>
                    <select
                        className="input"
                        value={local['llm.defaultProvider'] ?? 'deepseek'}
                        onChange={(e) => setLocal({ ...local, 'llm.defaultProvider': e.target.value })}
                    >
                        <option value="deepseek">DeepSeek</option>
                        <option value="glm">GLM-4.6V-Flash</option>
                    </select>
                </label>

                <label className="field">
                    <span className="field-label">DeepSeek 模型名</span>
                    <input
                        className="input"
                        value={local['llm.deepseek.model'] ?? ''}
                        onChange={(e) => setLocal({ ...local, 'llm.deepseek.model': e.target.value })}
                    />
                </label>
                <label className="field">
                    <span className="field-label">DeepSeek API Key（当前：{secrets.deepseekKey || '未配置'}）</span>
                    <input className="input" value={key1} onChange={(e) => setKey1(e.target.value)} placeholder="留空表示不修改" />
                </label>

                <label className="field">
                    <span className="field-label">GLM 模型名</span>
                    <input
                        className="input"
                        value={local['llm.glm.model'] ?? ''}
                        onChange={(e) => setLocal({ ...local, 'llm.glm.model': e.target.value })}
                    />
                </label>
                <label className="field">
                    <span className="field-label">GLM API Key（当前：{secrets.glmKey || '未配置'}）</span>
                    <input className="input" value={key2} onChange={(e) => setKey2(e.target.value)} placeholder="留空表示不修改" />
                </label>

                <div className="row" style={{ gap: 10 }}>
                    <button className="btn btn-primary btn-sm" onClick={save}>保存设置</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => test('deepseek')}>测试 DeepSeek</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => test('glm')}>测试 GLM</button>
                </div>
            </div>
        </section>
    );
}
