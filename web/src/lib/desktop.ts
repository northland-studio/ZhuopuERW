/**
 * 桌面端桥接（Electron / Tauri 共用一套调用约定）
 *
 * - Electron：走 preload 暴露的 window.zhuopuDesktop
 * - Tauri：走 @tauri-apps/api 的 invoke，命令名与 main.rs 里注册的一致
 * - 网页端 hasDesktop() 为 false，顶部操作栏不渲染
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

/** 是否运行在 Tauri 里 */
export function isTauri(): boolean {
    return typeof window !== 'undefined' && !!(window as Win).__TAURI_INTERNALS__;
}

/** 主进程加载时带了 ?shell=1（Electron 兜底，不依赖 preload 是否注入） */
function shellFlag(): boolean {
    return typeof window !== 'undefined' && /[?&]shell=1/.test(window.location.search);
}

/** Tauri 命令调用（动态加载，避免 Web/Electron 构建把 Tauri API 打进来） */
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke(cmd, args)) as T;
}

function tauriBridge(): DesktopBridge {
    return {
        isDesktop: true,
        platform: 'tauri',
        minimize: () => void tauriInvoke('window_minimize'),
        toggleMaximize: async () => (await tauriInvoke<boolean>('window_toggle_maximize')) ?? false,
        close: () => void tauriInvoke('window_close'),
        isMaximized: () => false,
        // 真实的版本号与 review 目录由 Rust 端 app_info 提供
        info: () =>
            tauriInvoke<{ version: string; platform: string; reviewDir?: string; packaged?: boolean }>('app_info').catch(() => ({
                version: '',
                platform: 'tauri'
            })),
        review: {
            list: () => tauriInvoke('review_list'),
            read: (name) => tauriInvoke('review_read', { name }),
            write: (name, content) => tauriInvoke('review_write', { name, content }),
            remove: (name) => tauriInvoke('review_delete', { name }),
            reveal: () => tauriInvoke<void>('review_reveal')
        },
        pickFile: async () => null
    };
}

/**
 * 桥接对象做模块级缓存：Tauri 的桥是现 new 的，如果每次调用都返回新对象，
 * 引用会随渲染变化，导致依赖它的 useCallback/useEffect 无限重跑（表现为循环读取）。
 */
let cachedBridge: DesktopBridge | null | undefined;

export function desktop(): DesktopBridge | null {
    if (typeof window === 'undefined') return null;
    if (cachedBridge !== undefined) return cachedBridge;

    const b = (window as Win).zhuopuDesktop;
    if (b) {
        cachedBridge = b;
        return cachedBridge;
    }
    if (isTauri()) {
        cachedBridge = tauriBridge();
        return cachedBridge;
    }
    // preload 未注入时的兜底：仍返回一个壳，让标题栏渲染出来
    if (shellFlag()) {
        const noop = () => {};
        cachedBridge = {
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
        return cachedBridge;
    }
    cachedBridge = null;
    return null;
}

export function hasDesktop(): boolean {
    return !!desktop() || shellFlag() || isTauri();
}
