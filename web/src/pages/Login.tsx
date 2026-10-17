import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';

export default function Login() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { push } = useToast();

    const [mode, setMode] = useState<'code' | 'password'>('code');
    const [email, setEmail] = useState(params.get('email') ?? '');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [countdown, setCountdown] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const sendCode = async () => {
        setError('');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError('请输入正确的邮箱地址');
            return;
        }
        setBusy(true);
        try {
            await api('/api/auth/send-code', { body: { email, purpose: 'login' } });
            push('验证码已发送，请查看邮箱', 'ok');
            setCountdown(60);
            const timer = window.setInterval(() => {
                setCountdown((c) => {
                    if (c <= 1) { window.clearInterval(timer); return 0; }
                    return c - 1;
                });
            }, 1000);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            if (mode === 'code') {
                const r = await api<{ token: string; user: unknown; created: boolean }>('/api/auth/login', {
                    body: { email, code }
                });
                localStorage.setItem('zhuopu.token', r.token);
                push(r.created ? '账号已创建，正在进入工作台' : '登录成功', 'ok');
            } else {
                const r = await api<{ token: string }>('/api/auth/login-password', {
                    body: { account: email, password }
                });
                localStorage.setItem('zhuopu.token', r.token);
                push('登录成功', 'ok');
            }
            navigate('/reviews', { replace: true });
            window.location.reload();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="page page-narrow" style={{ paddingTop: 72 }}>
            <div className="card card-pad" style={{ padding: 32 }}>
                <h1 style={{ fontSize: 24, marginBottom: 6 }}>登录琢璞</h1>
                <p className="muted" style={{ fontSize: 13.5, marginBottom: 26 }}>
                    使用邮箱验证码登录；首次登录会自动创建账号。
                </p>

                <div className="row" style={{ gap: 8, marginBottom: 22 }}>
                    <button
                        className={`btn btn-sm ${mode === 'code' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setMode('code')}
                        type="button"
                    >
                        验证码登录
                    </button>
                    <button
                        className={`btn btn-sm ${mode === 'password' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setMode('password')}
                        type="button"
                    >
                        密码登录
                    </button>
                </div>

                <form onSubmit={submit} className="stack" style={{ gap: 16 }}>
                    <label className="field">
                        <span className="field-label">{mode === 'code' ? '邮箱' : '邮箱或用户名'}</span>
                        <input
                            className="input"
                            type={mode === 'code' ? 'email' : 'text'}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder={mode === 'code' ? 'teacher@example.com' : 'teacher@example.com'}
                            autoComplete="username"
                            required
                        />
                    </label>

                    {mode === 'code' ? (
                        <label className="field">
                            <span className="field-label">验证码</span>
                            <div className="row" style={{ gap: 10 }}>
                                <input
                                    className="input"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="6 位数字"
                                    inputMode="numeric"
                                    style={{ letterSpacing: '0.3em', fontFamily: 'var(--font-mono)' }}
                                    required
                                />
                                <button
                                    className="btn btn-ghost"
                                    type="button"
                                    onClick={sendCode}
                                    disabled={busy || countdown > 0}
                                    style={{ flex: '0 0 auto', minWidth: 116 }}
                                >
                                    {countdown > 0 ? `${countdown} 秒后重发` : '获取验证码'}
                                </button>
                            </div>
                        </label>
                    ) : (
                        <label className="field">
                            <span className="field-label">密码</span>
                            <input
                                className="input"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="至少 8 位"
                                autoComplete="current-password"
                                required
                            />
                        </label>
                    )}

                    {error && <p className="error-text">{error}</p>}

                    <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
                        {busy ? '处理中…' : '登录'}
                    </button>
                </form>

                <div className="row spread" style={{ marginTop: 18 }}>
                    <button
                        className="btn btn-sm"
                        style={{ padding: 0, color: 'var(--ink-500)' }}
                        onClick={() => navigate('/forgot')}
                        type="button"
                    >
                        忘记密码
                    </button>
                    <span className="tiny muted">登录即表示同意仅用于教学场景</span>
                </div>
            </div>
        </div>
    );
}
