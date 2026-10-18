import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Intro } from './components/Intro';
import { useAuth } from './lib/auth';
import Home from './pages/Home';
import Login from './pages/Login';
import Reviews from './pages/Reviews';
import ReviewDetail from './pages/ReviewDetail';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import Share from './pages/Share';
import Reset from './pages/Reset';
import Forgot from './pages/Forgot';
import LocalReviews from './pages/LocalReviews';

const INTRO_KEY = 'zhuopu.intro.seen';

/** 需要登录的路由 */
function Protected({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) {
        return (
            <div className="page" style={{ paddingTop: 80 }}>
                <div className="skeleton" style={{ height: 120, borderRadius: 18 }} />
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    return <>{children}</>;
}

export function App() {
    const { loading } = useAuth();
    const [introDone, setIntroDone] = useState(() => {
        try {
            return sessionStorage.getItem(INTRO_KEY) === '1';
        } catch {
            return false;
        }
    });

    useEffect(() => {
        document.title = '琢璞英语讲评工作台';
    }, []);

    const finishIntro = () => {
        try {
            sessionStorage.setItem(INTRO_KEY, '1');
        } catch {
            /* 忽略隐私模式限制 */
        }
        setIntroDone(true);
    };

    return (
        <>
            {!introDone && <Intro onDone={finishIntro} />}
            <div style={{ opacity: introDone ? 1 : 0, transition: 'opacity 0.3s ease 0.05s' }}>
                <Layout>
                    {loading ? null : (
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/login" element={<Login />} />
                            <Route path="/forgot" element={<Forgot />} />
                            <Route path="/local" element={<LocalReviews />} />
                            <Route path="/reset" element={<Reset />} />
                            <Route path="/share/:token" element={<Share />} />
                            <Route path="/reviews" element={<Protected><Reviews /></Protected>} />
                            <Route path="/reviews/:id" element={<Protected><ReviewDetail /></Protected>} />
                            <Route path="/profile" element={<Protected><Profile /></Protected>} />
                            <Route path="/admin" element={<Protected><Admin /></Protected>} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    )}
                </Layout>
            </div>
        </>
    );
}
