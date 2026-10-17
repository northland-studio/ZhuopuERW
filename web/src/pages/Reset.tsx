import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';

export default function Reset() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { push } = useToast();

    const [email, setEmail] = useState(params.get('email') ?? '');
    const [token, setToken] = useState(params.get('token') ?? '');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const hasLink = !!params.get('token');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password.length < 8) { setError('密码至少 8 位'); return; }
        if (password !== confirm) { setError('两次输入的密码不一致'); return; }
        setBusy(true);
        try {
            await api('/api/auth/reset', { body: { email, token, password } });
            push('密码已重置，请使用新密码登录', 'ok');
            navigate('/login', { replace: true });
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="page page-narrow" style={{ paddingTop: 72 }}>
            <div className="card card-pad" style={{ padding: 32 }}>
                <h1 style={{ fontSize: 22, marginBottom: 6 }}>重置密码</h1>
                <p className="muted" style={{ fontSize: 13.5, marginBottom: 24 }}>
                    {hasLink ? '链接有效期为 10 分钟，仅可使用一次。' : '请把邮件里的重置链接完整打开，或填写邮件中的凭据。'}
                </p>
                <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
                    <label className="field">
                        <span className="field-label">邮箱</span>
                        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </label>
                    {!hasLink && (
                        <label className="field">
                            <span className="field-label">邮件中的重置凭据</span>
                            <input className="input" value={token} onChange={(e) => setToken(e.target.value)} required />
                        </label>
                    )}
                    <label className="field">
                        <span className="field-label">新密码</span>
                        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" required />
                    </label>
                    <label className="field">
                        <span className="field-label">确认新密码</span>
                        <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                    </label>
                    {error && <p className="error-text">{error}</p>}
                    <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
                        {busy ? '提交中…' : '确认重置'}
                    </button>
                </form>
            </div>
        </div>
    );
}
