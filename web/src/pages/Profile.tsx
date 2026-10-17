import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

export default function Profile() {
    const { user, setUser, logout } = useAuth();
    const { push } = useToast();
    const [username, setUsername] = useState(user?.username ?? '');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState('');

    if (!user) return null;

    const saveName = async () => {
        setBusy('name');
        try {
            const r = await api<{ user: typeof user }>('/api/auth/profile', {
                method: 'PATCH',
                body: { username }
            });
            setUser(r.user);
            push('用户名已更新', 'ok');
        } catch (e) {
            push((e as Error).message, 'bad');
        } finally {
            setBusy('');
        }
    };

    const savePassword = async () => {
        if (password.length < 8) { push('密码至少 8 位', 'bad'); return; }
        if (password !== confirm) { push('两次输入的密码不一致', 'bad'); return; }
        setBusy('pwd');
        try {
            await api('/api/auth/password', { body: { password } });
            setPassword('');
            setConfirm('');
            push('密码已更新，下次可用密码登录', 'ok');
            window.setTimeout(() => window.location.reload(), 600);
        } catch (e) {
            push((e as Error).message, 'bad');
        } finally {
            setBusy('');
        }
    };

    return (
        <div className="page page-narrow" style={{ paddingTop: 40 }}>
            <h1 style={{ fontSize: 26, marginBottom: 6 }}>个人主页</h1>
            <p className="muted tiny" style={{ marginBottom: 28 }}>这里可以修改用户名与登录密码。</p>

            <section className="card card-pad" style={{ marginBottom: 18 }}>
                <h2 style={{ fontSize: 16, marginBottom: 16 }}>账号</h2>
                <div className="stack" style={{ gap: 14 }}>
                    <label className="field">
                        <span className="field-label">邮箱</span>
                        <input className="input" value={user.email} disabled />
                    </label>
                    <label className="field">
                        <span className="field-label">用户名</span>
                        <div className="row" style={{ gap: 10 }}>
                            <input
                                className="input"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                maxLength={20}
                            />
                            <button className="btn btn-primary btn-sm" onClick={saveName} disabled={busy === 'name' || username === user.username}>
                                {busy === 'name' ? '保存中…' : '保存'}
                            </button>
                        </div>
                        <span className="hint">2–20 个字，支持中文、字母、数字、下划线与连字符。</span>
                    </label>
                </div>
            </section>

            <section className="card card-pad" style={{ marginBottom: 18 }}>
                <h2 style={{ fontSize: 16, marginBottom: 6 }}>登录密码</h2>
                <p className="tiny muted" style={{ marginBottom: 16 }}>
                    {user.hasPassword ? '已设置密码，可以用邮箱 + 密码登录。' : '还没有设置密码，目前只能用邮箱验证码登录。'}
                </p>
                <div className="stack" style={{ gap: 14 }}>
                    <label className="field">
                        <span className="field-label">新密码</span>
                        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" />
                    </label>
                    <label className="field">
                        <span className="field-label">确认新密码</span>
                        <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                    </label>
                    <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={savePassword} disabled={busy === 'pwd' || !password}>
                        {busy === 'pwd' ? '保存中…' : '设置密码'}
                    </button>
                </div>
            </section>

            <section className="card card-pad">
                <h2 style={{ fontSize: 16, marginBottom: 12 }}>退出登录</h2>
                <button className="btn btn-ghost" onClick={async () => { await logout(); window.location.href = '/'; }}>
                    退出当前账号
                </button>
            </section>
        </div>
    );
}
