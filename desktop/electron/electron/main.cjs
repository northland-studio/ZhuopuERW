/**
 * 琢璞英语讲评工作台 · Electron 主进程
 *
 * 白屏修复：打包后不再 loadFile 直接加载 SPA（Vite 用绝对路径 /assets/...，file:// 解析不到）。
 * 现在起一个只监听 127.0.0.1 的本地静态服务器托管 web-dist，
 * 并把 /api 反向代理到线上服务，前端所有请求同源，路径与网页版完全一致。
 *
 * 原生能力：系统托盘、无边框 + 自定义顶部操作栏、禁用开发者工具与右键、
 *           单实例、读写程序目录下的 review 文件夹。
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog, nativeImage, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const isDev = !app.isPackaged;
const DEV_URL = process.env.ZHUOPU_DEV_URL || 'http://127.0.0.1:5173';
const API_ORIGIN = process.env.ZHUOPU_API_ORIGIN || 'https://zhuopu.xuanjian.top';

const WEB_DIST = app.isPackaged
    ? path.join(process.resourcesPath, 'web-dist')
    : path.join(__dirname, '..', 'web-dist');

let mainWindow = null;
let tray = null;
let quitting = false;
let localServer = null;
let localPort = 0;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon'
};

function reviewDir() {
    const base = app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..');
    const dir = path.join(base, 'review');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function appIcon() {
    const candidates = [
        path.join(WEB_DIST, 'brand', 'logo.png'),
        path.join(__dirname, '..', '..', 'web', 'public', 'brand', 'logo.png')
    ];
    for (const p of candidates) if (fs.existsSync(p)) return nativeImage.createFromPath(p);
    return nativeImage.createEmpty();
}

/* ---------------- 本地静态服务器 + /api 反向代理 ---------------- */

function serveStatic(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    const rel = path.normalize(pathname).replace(/^([/\\])+/, '');
    const filePath = path.join(WEB_DIST, rel);
    if (!filePath.startsWith(WEB_DIST)) {
        res.writeHead(403).end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, buf) => {
        if (err) {
            if (!path.extname(filePath)) {
                fs.readFile(path.join(WEB_DIST, 'index.html'), (e2, html) => {
                    if (e2) { res.writeHead(404).end('Not Found'); return; }
                    res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(html);
                });
                return;
            }
            res.writeHead(404).end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
        res.end(buf);
    });
}

function proxyApi(req, res) {
    const target = new URL(req.url, API_ORIGIN);
    const client = target.protocol === 'https:' ? https : http;
    const headers = { ...req.headers, host: target.host };
    delete headers['accept-encoding'];

    const upstream = client.request(
        {
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port,
            path: target.pathname + target.search,
            method: req.method,
            headers,
            timeout: 300000
        },
        (up) => {
            res.writeHead(up.statusCode || 502, up.headers);
            up.pipe(res);
        }
    );
    upstream.on('error', (e) => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: `无法连接服务器：${e.message}` }));
    });
    upstream.on('timeout', () => upstream.destroy());
    req.pipe(upstream);
}

function startLocalServer() {
    return new Promise((resolve) => {
        localServer = http.createServer((req, res) => {
            if (req.url && req.url.startsWith('/api/')) proxyApi(req, res);
            else serveStatic(req, res);
        });
        localServer.listen(0, '127.0.0.1', () => {
            localPort = localServer.address().port;
            console.log(`[本地服务] http://127.0.0.1:${localPort}/  静态目录 ${WEB_DIST}`);
            resolve(localPort);
        });
    });
}

/* ---------------- 窗口 ---------------- */

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: Math.min(1440, Math.round(width * 0.86)),
        height: Math.min(920, Math.round(height * 0.88)),
        minWidth: 1024,
        minHeight: 680,
        show: false,
        backgroundColor: '#faf8f7',
        frame: false,
        titleBarStyle: 'hidden',
        icon: appIcon(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            devTools: isDev
        }
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());

    if (isDev) mainWindow.loadURL(DEV_URL);
    else mainWindow.loadURL(`http://127.0.0.1:${localPort}/`);

    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
        console.error(`[加载失败] ${code} ${desc} ${url}`);
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        const key = (input.key || '').toLowerCase();
        const blocking =
            key === 'f12' ||
            (input.control && input.shift && ['i', 'j', 'c'].includes(key)) ||
            (input.control && key === 'r' && !isDev);
        if (blocking) event.preventDefault();
    });
    mainWindow.webContents.on('context-menu', (event) => event.preventDefault());

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.on('close', (event) => {
        if (!quitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    tray = new Tray(appIcon().resize({ width: 22, height: 22 }));
    tray.setToolTip('琢璞英语讲评工作台');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: '显示主窗口', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
        { label: '隐藏到托盘', click: () => mainWindow?.hide() },
        { type: 'separator' },
        { label: '打开讲评文件夹', click: () => { void shell.openPath(reviewDir()); } },
        { label: '打开网页版', click: () => { void shell.openExternal(API_ORIGIN); } },
        { type: 'separator' },
        { label: '退出', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else { mainWindow.show(); mainWindow.focus(); }
    });
}

/* ---------------- IPC ---------------- */

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
});
ipcMain.handle('window:close', () => mainWindow?.hide());
ipcMain.handle('window:is-maximized', () => !!mainWindow?.isMaximized());
ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
    reviewDir: reviewDir(),
    apiOrigin: API_ORIGIN
}));

ipcMain.handle('review:list', () => {
    const dir = reviewDir();
    return fs.readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith('.json'))
        .map((f) => {
            const st = fs.statSync(path.join(dir, f));
            return { name: f, size: st.size, mtime: st.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
});

ipcMain.handle('review:read', (_e, name) => {
    const full = path.join(reviewDir(), path.basename(String(name)));
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
});

ipcMain.handle('review:write', (_e, name, content) => {
    const safe = String(name).replace(/[\\/:*?"<>|]/g, '_');
    const full = path.join(reviewDir(), safe.endsWith('.json') ? safe : `${safe}.json`);
    fs.writeFileSync(full, String(content), 'utf8');
    return full;
});

ipcMain.handle('review:delete', (_e, name) => {
    const full = path.join(reviewDir(), path.basename(String(name)));
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return true;
});

ipcMain.handle('review:reveal', () => shell.openPath(reviewDir()));

ipcMain.handle('file:pick', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: '试卷文件', extensions: ['md', 'txt', 'docx', 'pdf', 'png', 'jpg', 'jpeg', 'webp'] }]
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    return { path: p, name: path.basename(p), data: fs.readFileSync(p).toString('base64') };
});

/* ---------------- 生命周期 ---------------- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    });

    app.whenReady().then(async () => {
        Menu.setApplicationMenu(null);
        if (isDev) {
            createWindow();
        } else {
            await startLocalServer();
            createWindow();
        }
        createTray();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
            else mainWindow?.show();
        });
    });

    app.on('before-quit', () => { quitting = true; });
    app.on('window-all-closed', () => { /* 托盘常驻 */ });
    app.on('will-quit', () => { localServer?.close(); });
}
