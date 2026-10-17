import { useEffect, useState } from 'react';
import { desktop, hasDesktop } from '../lib/desktop';
import '../styles/titlebar.css';

/**
 * 桌面客户端自绘顶部操作栏（Electron / Tauri）
 * 网页端不渲染：hasDesktop() 为 false。
 */
export function DesktopTitleBar() {
    const [maximized, setMaximized] = useState(false);
    const [version, setVersion] = useState('');

    useEffect(() => {
        const d = desktop();
        if (!d) return;
        void Promise.resolve(d.isMaximized()).then(setMaximized);
        void d.info().then((i) => setVersion(i.version)).catch(() => {});
    }, []);

    if (!hasDesktop()) return null;

    const d = desktop()!;

    return (
        <div className="tbar" role="banner">
            <div className="tbar-drag" />
            <div className="tbar-brand">
                <img src="/brand/logo.png" alt="" width={18} height={18} className="tbar-logo" />
                <span className="tbar-title">琢璞英语讲评工作台</span>
                {version && <span className="tbar-ver">v{version}</span>}
            </div>
            <div className="tbar-actions">
                <button className="tbar-btn" onClick={() => void d.minimize()} title="最小化" aria-label="最小化">
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                        <path d="M2 5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                </button>
                <button
                    className="tbar-btn"
                    onClick={async () => setMaximized(!!(await Promise.resolve(d.toggleMaximize())))}
                    title={maximized ? '还原' : '最大化'}
                    aria-label={maximized ? '还原' : '最大化'}
                >
                    {maximized ? (
                        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                            <rect x="2.4" y="2.4" width="4.2" height="4.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
                            <path d="M3.8 2.4V1.2h5v5H7.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
                        </svg>
                    ) : (
                        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                            <rect x="1.8" y="1.8" width="6.4" height="6.4" fill="none" stroke="currentColor" strokeWidth="1.1" />
                        </svg>
                    )}
                </button>
                <button className="tbar-btn is-close" onClick={() => void d.close()} title="关闭" aria-label="关闭">
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                        <path d="M2.2 2.2l5.6 5.6M7.8 2.2l-5.6 5.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
