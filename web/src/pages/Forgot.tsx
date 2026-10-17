import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';

export default function Forgot() {
    const { push } = useToast();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        try {
            await api('/api/auth/forgot', { body: { email } });
            setSent(true);
            push('如果该邮箱已注册，重置邮件已发送', 'ok');
        } catch (err) {
            push((err as Error).message, 'bad');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="page page-narrow" style={{ paddingTop: 72 }}>
            <div className="card card-pad" style={{ padding: 32 }}>
                <h1 style={{ fontSize: 22, marginBottom: 6 }}>忘记密码</h1>
                <p className="muted tiny" style={{ marginBottom: 24 }}>
                    填写登录邮箱，我们会发一封重置链接；链接 10 分钟内有效。
                </p>
                {sent ? (
                    <>
                        <p style={{ fontSize: 14, lineHeight: 1.9 }}>
                            重置邮件已发送到 <strong>{email}</strong>。
                            如果没收到，请检查垃圾邮件箱，或稍后重发。
                        </p>
                        <button className="btn btn-ghost btn-sm" style={{ marginTop: 20 }} onClick={() => navigate('/login')}>
                            返回登录
                        </button>
                    </>
                ) : (
                    <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
                        <label className="field">
                            <span className="field-label">邮箱</span>
                            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </label>
                        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
                            {busy ? '发送中…' : '发送重置邮件'}
                        </button>
                        <button className="btn btn-ghost btn-block" type="button" onClick={() => navigate('/login')}>
                            返回登录
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
