import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, getToken, setToken } from './api';

export interface User {
    id: number;
    email: string;
    username: string;
    role: 'user' | 'admin';
    hasPassword: boolean;
}

interface AuthState {
    user: User | null;
    loading: boolean;
    loginWithCode: (email: string, code: string) => Promise<{ created: boolean }>;
    loginWithPassword: (account: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
    setUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const r = await api<{ user: User }>('/api/auth/me');
            setUser(r.user);
        } catch (e) {
            // 401 属正常（未登录）
            if (!(e instanceof ApiError) || e.status !== 401) {
                console.warn('获取当前用户失败', e);
            }
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!getToken()) {
            // 没有本地 token 时仍尝试用 Cookie 恢复（浏览器场景）
        }
        void refresh();
    }, [refresh]);

    const loginWithCode = useCallback(async (email: string, code: string) => {
        const r = await api<{ user: User; token: string; created: boolean }>('/api/auth/login', {
            body: { email, code }
        });
        setToken(r.token);
        setUser(r.user);
        return { created: r.created };
    }, []);

    const loginWithPassword = useCallback(async (account: string, password: string) => {
        const r = await api<{ user: User; token: string }>('/api/auth/login-password', {
            body: { account, password }
        });
        setToken(r.token);
        setUser(r.user);
    }, []);

    const logout = useCallback(async () => {
        try {
            await api('/api/auth/logout', { method: 'POST' });
        } finally {
            setToken(null);
            setUser(null);
        }
    }, []);

    const value = useMemo<AuthState>(
        () => ({ user, loading, loginWithCode, loginWithPassword, logout, refresh, setUser }),
        [user, loading, loginWithCode, loginWithPassword, logout, refresh]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
    return ctx;
}

export { ApiError };
