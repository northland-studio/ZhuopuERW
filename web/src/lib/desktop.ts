/**
 * 桌面端桥接（Electron / Tauri 共用一套调用约定）
 *
 * Electron 走 preload 暴露的 window.zhuopuDesktop；
 * Tauri 通过 @tauri-apps/api 的 invoke 暴露同名能力。
 * 网页端 hasDesktop() 为 false，顶部操作栏不渲染。
 */

export interface DesktopReviewFile {
    name: string;
    size: number;
    mtime: number;
}

export interface DesktopBridge {
    platform?: string;
    isDesktop: true;
    minimize: () => Promise<void> | void;
    toggleMaximize: () => Promise<boolean> | void;
    close: () => Promise<void> | void;
    isMaximized: () => Promise<boolean> | boolean;
    info: () => Promise<{ version: string; platform: string; packaged?: boolean; reviewDir?: string }>;
    review: {
        list: () => Promise<DesktopReviewFile[]>;
        read: (name: string) => Promise<string | null>;
        write: (name: string, content: string) => Promise<string>;
        remove: (name: string) => Promise<boolean>;
        reveal: () => Promise<void>;
    };
    pickFile: () => Promise<{ path: string; name: string; data: string } | null>;
}

type Win = Window & { zhuopuDesktop?: DesktopBridge; __TAURI_INTERNALS__?: unknown };

/** 主进程加载时带了 ?shell=1，标识「跑在桌面壳里」，不依赖 preload 是否注入 */
function shellFlag(): boolean {
    return typeof window !== 'undefined' && /[?&]shell=1/.test(window.location.search);
}

export function desktop(): DesktopBridge | null {
    if (typeof window === 'undefined') return null;
    const b = (window as Win).zhuopuDesktop;
    if (b) return b;
    // preload 未注入时的兜底：仍返回一个壳，让标题栏渲染出来；
    // 按钮调用无副作用，真正生效需 preload 正常注入。
    if (shellFlag()) {
        const noop = () => {};
        return {
            isDesktop: true,
            platform: '',
            minimize: noop,
            toggleMaximize: () => undefined,
            close: noop,
            isMaximized: () => false,
            info: async () => ({ version: '', platform: '' }),
            review: {
                list: async () => [],
                read: async () => null,
                write: async () => '',
                remove: async () => false,
                reveal: async () => {}
            },
            pickFile: async () => null
        };
    }
    return null;
}

export function hasDesktop(): boolean {
    return !!desktop() || shellFlag();
}

/** 是否运行在 Tauri 里（用于显示不同的窗口按钮风格） */
export function isTauri(): boolean {
    return typeof window !== 'undefined' && !!(window as Win).__TAURI_INTERNALS__;
}
