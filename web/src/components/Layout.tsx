import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LogoMark } from './Logo';
import { useAuth } from '../lib/auth';
import '../styles/layout.css';

export function Layout({ children }: { children: React.ReactNode }) {
    const { user, logout } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);
    const navigate = useNavigate();
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [menuOpen]);

    const initial = (user?.username || user?.email || 'Z').slice(0, 1).toUpperCase();

    return (
        <>
            <header className="nav">
                <div className="nav-inner">
                    <Link to="/" className="nav-left" aria-label="返回首页">
                        <span className="brand-lockup">
                            <LogoMark size={34} />
                            <span className="brand-text">
                                <span className="brand-name">琢璞英语讲评工作台</span>
                                <span className="brand-en">Zhuopu English Review Workspace</span>
                            </span>
                        </span>
                    </Link>

                    <nav className="nav-links">
                        <NavLink to="/reviews" className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>
                            我的讲评
                        </NavLink>
                        {user ? (
                            <div style={{ position: 'relative' }} ref={menuRef}>
                                <button
                                    className="nav-link nav-user"
                                    type="button"
                                    onClick={() => setMenuOpen((v) => !v)}
                                    aria-expanded={menuOpen}
                                >
                                    <span className="nav-avatar">{initial}</span>
                                    用户中心
                                </button>
                                {menuOpen && (
                                    <div className="nav-menu">
                                        <div className="nav-menu-head">
                                            <div className="nav-menu-name">{user.username}</div>
                                            <div className="nav-menu-mail">{user.email}</div>
                                        </div>
                                        <button
                                            className="nav-menu-item"
                                            onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                                        >
                                            个人主页
                                        </button>
                                        <button
                                            className="nav-menu-item"
                                            onClick={() => { setMenuOpen(false); navigate('/reviews'); }}
                                        >
                                            我的讲评
                                        </button>
                                        {user.role === 'admin' && (
                                            <button
                                                className="nav-menu-item"
                                                onClick={() => { setMenuOpen(false); navigate('/admin'); }}
                                            >
                                                管理后台
                                            </button>
                                        )}
                                        <button
                                            className="nav-menu-item is-danger"
                                            onClick={async () => { setMenuOpen(false); await logout(); navigate('/'); }}
                                        >
                                            退出登录
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <NavLink to="/login" className="nav-link">
                                登录
                            </NavLink>
                        )}
                    </nav>

                    <button className="nav-burger" type="button" onClick={() => setSheetOpen((v) => !v)} aria-label="菜单">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>
            </header>

            {sheetOpen && (
                <div className="nav-sheet">
                    <NavLink to="/reviews" className="nav-link" onClick={() => setSheetOpen(false)}>我的讲评</NavLink>
                    {user ? (
                        <>
                            <NavLink to="/profile" className="nav-link" onClick={() => setSheetOpen(false)}>用户中心</NavLink>
                            {user.role === 'admin' && (
                                <NavLink to="/admin" className="nav-link" onClick={() => setSheetOpen(false)}>管理后台</NavLink>
                            )}
                            <button
                                className="nav-link"
                                style={{ textAlign: 'left' }}
                                onClick={async () => { setSheetOpen(false); await logout(); navigate('/'); }}
                            >
                                退出登录
                            </button>
                        </>
                    ) : (
                        <NavLink to="/login" className="nav-link" onClick={() => setSheetOpen(false)}>登录</NavLink>
                    )}
                </div>
            )}

            <main className="page-shell">{children}</main>
        </>
    );
}
