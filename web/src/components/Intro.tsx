import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { LogoMark } from './Logo';
import '../styles/intro.css';

const SLOGAN = ['璞', '石', '化', '璧', '厚', '学', '如', '山'];

/**
 * 首屏动画（按需求文档的分镜）：
 *   1 黑暗转主题色 #980B0E
 *   2 logo 与八字标语渐显
 *   3 八字标语排队绕 logo 旋转
 *   4 化作 logo 的边框
 *   5 logo 以贝塞尔曲线移动缩放到左下角（导航栏位置）
 *   6 logo 图层下向右滑出平台名称
 *   7 右侧「我的讲评 / 用户中心」渐显
 *   8 整个主题色主屏向上抬起，变成常驻导航栏
 *
 * 全过程约 5.2s，可点击右下角跳过；尊重 prefers-reduced-motion。
 */
export function Intro({ onDone }: { onDone: () => void }) {
    const [phase, setPhase] = useState<'dark' | 'brand' | 'slogan' | 'orbit' | 'border' | 'travel' | 'nav'>('dark');
    const [orbiting, setOrbiting] = useState(false);
    const stageRef = useRef<HTMLDivElement | null>(null);

    const logoX = useMotionValue(0);
    const logoY = useMotionValue(0);
    const logoScale = useMotionValue(1);
    /** 绕 logo 旋转的角度；每个字反向旋转，保证文字始终正立 */
    const orbitRotate = useMotionValue(0);
    const orbitCounter = useTransform(orbitRotate, (v) => -v);

    // 目标：导航栏里的 logo 槽位（左 20 + 17，上 15 + 17）
    const target = useMemo(() => {
        const size = 34;
        const left = 20 + size / 2;
        const top = 15 + size / 2;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight * 0.44;
        return { x: left - cx, y: top - cy, scale: size / 132 };
    }, []);

    const skip = () => {
        // 直接进入正常布局
        onDone();
    };

    useEffect(() => {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (reduce) { onDone(); return; }

        const timers: number[] = [];
        const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

        at(60, () => setPhase('brand'));
        at(620, () => setPhase('slogan'));
        at(1500, () => {
            setPhase('orbit');
            setOrbiting(true);
            animate(orbitRotate, 360, { duration: 1.5, ease: 'linear' });
        });
        at(2760, () => { setOrbiting(false); setPhase('border'); });
        at(3720, () => {
            setPhase('travel');
            // 贝塞尔感觉：两段位移，横向略弯、纵向先下后上
            animate(logoX, [0, target.x * 0.35, target.x], { duration: 0.95, times: [0, 0.45, 1], ease: [0.4, 0, 0.2, 1] });
            animate(logoY, [0, target.y * 0.55 + 70, target.y], { duration: 0.95, times: [0, 0.4, 1], ease: [0.16, 1, 0.3, 1] });
            animate(logoScale, [1, 0.62, target.scale], { duration: 0.95, times: [0, 0.5, 1], ease: [0.16, 1, 0.3, 1] });
        });
        at(4180, () => setPhase('nav'));
        at(5100, () => onDone());

        return () => timers.forEach((t) => window.clearTimeout(t));
    }, [onDone, target, logoX, logoY, logoScale]);

    const showBrand = phase !== 'dark';
    const showNav = phase === 'nav';

    const radius = 132;
    const orbitPos = (i: number) => {
        const angle = (i / SLOGAN.length) * Math.PI * 2 - Math.PI / 2;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    };

    return (
        <div className={`intro ${showBrand ? 'is-brand' : ''}`}>
            <div className="intro-stage" ref={stageRef}>
                {/* logo：外框在「化作边框」阶段由 SVG 描边画出 */}
                <motion.div
                    className="intro-logo"
                    style={{ x: logoX, y: logoY, scale: logoScale }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: showBrand ? 1 : 0 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                >
                    <motion.div
                        initial={{ scale: 0.86 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <LogoMark size={132} framed={false} variant="light" />
                    </motion.div>

                    {/* 标语化成的边框 */}
                    <svg className="intro-frame" viewBox="0 0 160 160" preserveAspectRatio="none">
                        <motion.rect
                            x="8"
                            y="8"
                            width="144"
                            height="144"
                            rx="30"
                            ry="30"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{
                                pathLength: phase === 'border' || phase === 'travel' || showNav ? 1 : 0,
                                opacity: phase === 'border' || phase === 'travel' || showNav ? 1 : 0
                            }}
                            transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
                        />
                    </svg>
                </motion.div>

                {/* 标语一行（slogan 阶段） */}
                {phase === 'slogan' && (
                    <div className="intro-slogan">
                        {SLOGAN.map((ch, i) => (
                            <motion.span
                                key={ch}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                className="intro-char-inline"
                            >
                                {ch}
                            </motion.span>
                        ))}
                    </div>
                )}

                {/* 绕 logo 排队旋转（orbit）→ 收成边框（border） */}
                {(phase === 'orbit' || phase === 'border') && (
                    <motion.div
                        style={{ position: 'absolute', left: 0, top: 0, rotate: orbitRotate }}
                    >
                        {SLOGAN.map((ch, i) => {
                            const p = orbitPos(i);
                            const borderPos = borderPoint(i, SLOGAN.length);
                            const toBorder = phase === 'border';
                            return (
                                <motion.span
                                    key={`${ch}-${i}`}
                                    className="intro-char"
                                    style={{ rotate: orbitCounter, marginLeft: -10, marginTop: -12 }}
                                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.8 }}
                                    animate={
                                        toBorder
                                            ? { x: borderPos.x, y: borderPos.y, opacity: 0, scale: 0.5 }
                                            : { x: p.x, y: p.y, opacity: 1, scale: 1 }
                                    }
                                    transition={{ duration: toBorder ? 0.75 : 0.55, delay: i * (toBorder ? 0.03 : 0.02), ease: [0.22, 1, 0.36, 1] }}
                                >
                                    {ch}
                                </motion.span>
                            );
                        })}
                    </motion.div>
                )}
            </div>

            {/* 收尾：红色主屏抬升成导航栏，名称从 logo 右侧滑出，右侧按钮渐显 */}
            {showNav && (
                <motion.div
                    className="intro-bar"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    style={{ pointerEvents: 'none' }}
                >
                    <div className="intro-nav">
                        <div className="intro-nav-left">
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{ width: 34, height: 34, display: 'block' }}
                            >
                                <LogoMark size={34} />
                            </motion.span>
                            <motion.div
                                className="intro-wordmark"
                                initial={{ opacity: 0, x: -14, width: 0 }}
                                animate={{ opacity: 1, x: 0, width: 'auto' }}
                                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <span className="intro-wordmark-cn">琢璞英语讲评工作台</span>
                                <span className="intro-wordmark-en">Zhuopu English Review Workspace</span>
                            </motion.div>
                        </div>
                        <motion.div
                            className="intro-links"
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <span>我的讲评</span>
                            <span>用户中心</span>
                        </motion.div>
                    </div>
                </motion.div>
            )}

            <button className="intro-skip" onClick={skip} type="button">
                跳过
            </button>
        </div>
    );
}

/** 8 个字收束到 logo 外框的 8 个方位 */
function borderPoint(index: number, total: number) {
    const r = 86;
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

/** 供 Layout 复用：导航栏几何 */
export const NAV = { height: 64, logoSize: 34, padding: 20 };
