import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');           // desktop/electron/
const web = path.resolve(root, '..', 'web');

/* ---------- 1. 主进程：加载 URL 一律带 ?shell=1 ---------- */
{
    const p = path.join(root, 'electron', 'main.cjs');
    let s = fs.readFileSync(p, 'utf8');
    if (!s.includes('function withShell')) {
        s = s.replace(
            "const API_ORIGIN = 'https://zhuopu.xuanjian.top'; // 写死 HK 后端，不再读环境变量",
            "const API_ORIGIN = 'https://zhuopu.xuanjian.top'; // 写死 HK 后端，不再读环境变量\n\n/** 给加载地址追加 shell=1，前端据此渲染自绘标题栏（不依赖 preload 是否注入） */\nfunction withShell(u) {\n    return u + (u.includes('?') ? '&' : '?') + 'shell=1';\n}"
        );
        s = s.replace(
            "    if (loadMode === 'dev') mainWindow.loadURL(DEV_URL);\n    else if (loadMode === 'remote') mainWindow.loadURL(API_ORIGIN + '/');\n    else mainWindow.loadURL(`http://127.0.0.1:${localPort}/`);",
            "    if (loadMode === 'dev') mainWindow.loadURL(withShell(DEV_URL));\n    else if (loadMode === 'remote') mainWindow.loadURL(withShell(API_ORIGIN + '/'));\n    else mainWindow.loadURL(withShell(`http://127.0.0.1:${localPort}/`));"
        );
        fs.writeFileSync(p, s, 'utf8');
        console.log('main.cjs：加载 URL 追加 ?shell=1');
    }
}

/* ---------- 2. 前端：shell 标记兜底渲染标题栏 ---------- */
{
    const p = path.join(web, 'src', 'lib', 'desktop.ts');
    let s = fs.readFileSync(p, 'utf8');
    if (!s.includes('shell=1')) {
        s = s.replace(
            `export function desktop(): DesktopBridge | null {
    if (typeof window === 'undefined') return null;
    return (window as Win).zhuopuDesktop ?? null;
}`,
            `function shellFlag(): boolean {
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
            toggleMaximize: () => false,
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
}`,
        );
        // hasDesktop 也要认 shell 标记
        s = s.replace(
            `export function hasDesktop(): boolean {
    return !!desktop();
}`,
            `export function hasDesktop(): boolean {
    return !!desktop() || shellFlag();
}`,
        );
        fs.writeFileSync(p, s, 'utf8');
        console.log('desktop.ts：shell 标记兜底渲染标题栏');
    }
}
