import fs from 'node:fs';
import path from 'node:path';

const p = path.resolve(import.meta.dirname, '..', 'electron', 'main.cjs');
let s = fs.readFileSync(p, 'utf8');

/* 加载源三选一：remote（直连线上，默认）| static（本地静态服务器）| dev（Vite） */
s = s.replace(
    "const useStaticServer = !isDev || process.env.ZHUOPU_DEV_STATIC === '1';",
    "const loadMode = process.env.ZHUOPU_LOAD || (process.env.ZHUOPU_DEV_STATIC === '1' ? 'static' : (isDev ? 'dev' : 'remote'));"
);

/* 窗口地址 */
s = s.replace(
    "    if (!useStaticServer) mainWindow.loadURL(DEV_URL);\n    else mainWindow.loadURL(`http://127.0.0.1:${localPort}/`);",
    "    if (loadMode === 'dev') mainWindow.loadURL(DEV_URL);\n    else if (loadMode === 'remote') mainWindow.loadURL(API_ORIGIN + '/');\n    else mainWindow.loadURL(`http://127.0.0.1:${localPort}/`);"
);

/* 启动时是否起本地服务器 */
s = s.replace(
    "        if (!useStaticServer) {\n            createWindow();\n        } else {\n            await startLocalServer();\n            createWindow();\n        }",
    "        if (loadMode === 'static') await startLocalServer();\n        createWindow();"
);

/* preload 可关闭，便于定位白屏 */
s = s.replace(
    "            preload: path.join(__dirname, 'preload.cjs'),",
    "            preload: process.env.ZHUOPU_NO_PRELOAD === '1' ? undefined : path.join(__dirname, 'preload.cjs'),"
);

fs.writeFileSync(p, s, 'utf8');
console.log('已加 ZHUOPU_LOAD=remote|static|dev 与 ZHUOPU_NO_PRELOAD');
