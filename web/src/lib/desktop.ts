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

export function desktop(): DesktopBridge | null {
    if (typeof window === 'undefined') return null;
    return (window as Win).zhuopuDesktop ?? null;
}

export function hasDesktop(): boolean {
    return !!desktop();
}

/** 是否运行在 Tauri 里（用于显示不同的窗口按钮风格） */
export function isTauri(): boolean {
    return typeof window !== 'undefined' && !!(window as Win).__TAURI_INTERNALS__;
}
