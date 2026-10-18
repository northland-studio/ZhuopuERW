import fs from 'node:fs';
import path from 'node:path';

const p = path.resolve(import.meta.dirname, '..', 'electron', 'main.cjs');
let s = fs.readFileSync(p, 'utf8');

/* 1) 渲染进程日志：console / 崩溃 / 加载失败 / preload 错误 全部打到 stdout */
if (!s.includes('[渲染]')) {
    s = s.replace(
        "    mainWindow.webContents.on('did-fail-load'",
        `    mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
        console.log('[渲染]', level, message, sourceId ? sourceId.split('/').pop() + ':' + line : '');
    });
    mainWindow.webContents.on('preload-error', (_e, preloadPath, error) => {
        console.error('[preload 错误]', preloadPath, error && error.message);
    });
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
        console.error('[渲染进程崩溃]', JSON.stringify(details));
    });
    mainWindow.webContents.on('did-fail-load'`
    );
}

/* 2) 开发模式下允许打开开发者工具（正式包仍然禁用） */
s = s.replace(
    `        const blocking =
            key === 'f12' ||
            (input.control && input.shift && ['i', 'j', 'c'].includes(key)) ||
            (input.control && key === 'r' && !isDev);`,
    `        if (isDev && input.control && input.shift && key === 'i') return; // 开发时允许 Ctrl+Shift+I
        const blocking =
            key === 'f12' ||
            (input.control && input.shift && ['i', 'j', 'c'].includes(key)) ||
            (input.control && key === 'r' && !isDev);`
);

fs.writeFileSync(p, s, 'utf8');
console.log('main.cjs：已加渲染进程日志，开发模式允许 Ctrl+Shift+I');
