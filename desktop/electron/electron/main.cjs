/**
 * 琢璞英语讲评工作台 · Electron 主进程
 *
 * 原生能力：
 *   - 系统托盘（显示/隐藏、打开讲评文件夹、退出）
 *   - 无边框窗口 + 自定义顶部操作栏（前端 DesktopTitleBar 调 IPC）
 *   - 禁用开发者工具、禁用右键菜单、屏蔽 F12 / Ctrl+Shift+I
 *   - 单实例运行（再次启动只聚焦已有窗口）
 *   - 读写程序目录下的 review 文件夹（文件版讲评，离线可用）
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog, nativeImage, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = !app.isPackaged;
/** 生产环境优先加载打包进来的前端产物；开发时回落到本地 Vite */
const DEV_URL = process.env.ZHUOPU_DEV_URL || 'http://127.0.0.1:5173';
const WEB_DIST = app.isPackaged
    ? path.join(process.resourcesPath, 'web-dist')
    : path.join(__dirname, '..', 'web-dist');

let mainWindow = null;
let tray = null;
let quitting = false;

/** 讲评文件夹：放在程序所在目录（U 盘/移动版直接带走） */
function reviewDir() {
    const base = app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..');
    const dir = path.join(base, 'review');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function appIcon() {
    const candidates = [
        path.join(process.resourcesPath, 'web-dist', 'brand', 'logo.png'),
        path.join(__dirname, '..', 'web-dist', 'brand', 'logo.png'),
        path.join(__dirname, '..', '..', 'web', 'public', 'brand', 'logo.png')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return nativeImage.createFromPath(p);
    }
    return nativeImage.createEmpty();
}

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: Math.min(1440, Math.round(width * 0.86)),
        height: Math.min(920, Math.round(height * 0.88)),
        minWidth: 1024,
        minHeight: 680,
        show: false,
        backgroundColor: '#faf8f7',
        // 无边框：顶部操作栏由前端自绘，保证与网页端视觉一致
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 14, y: 14 },
        icon: appIcon(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            devTools: isDev // 正式包禁用开发者工具
        }
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());

    if (isDev) {
        mainWindow.loadURL(DEV_URL);
    } else {
        mainWindow.loadFile(path.join(WEB_DIST, 'index.html'));
    }

    // 禁用右键菜单与刷新/开发者工具快捷键
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const key = (input.key || '').toLowerCase();
        const blocking =
            key === 'f12' ||
            (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c')) ||
            (input.control && key === 'r' && !isDev);
        if (blocking) event.preventDefault();
    });
    mainWindow.webContents.on('context-menu', (event) => {
        event.preventDefault();
    });

    // 外链一律用系统浏览器打开，不在应用内导航
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.on('close', (event) => {
        // 关闭按钮只是收进托盘，真正退出走托盘菜单
        if (!quitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    tray = new Tray(appIcon().resize({ width: 22, height: 22 }));
    tray.setToolTip('琢璞英语讲评工作台');
    const menu = Menu.buildFromTemplate([
        {
            label: '显示主窗口',
            click: () => { mainWindow?.show(); mainWindow?.focus(); }
        },
        {
            label: '隐藏到托盘',
            click: () => mainWindow?.hide()
        },
        { type: 'separator' },
        {
            label: '打开讲评文件夹',
            click: () => { void shell.openPath(reviewDir()); }
        },
        {
            label: '打开网页版',
            click: () => { void shell.openExternal('https://zhuopu.xuanjian.top'); }
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => { quitting = true; app.quit(); }
        }
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else { mainWindow.show(); mainWindow.focus(); }
    });
}

/* ---------------- 渲染进程可用的原生能力 ---------------- */

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
    reviewDir: reviewDir()
}));

/** 文件版讲评：列出 / 读取 / 写入 / 删除 review 目录下的 json */
ipcMain.handle('review:list', () => {
    const dir = reviewDir();
    return fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith('.json'))
        .map((f) => {
            const full = path.join(dir, f);
            const st = fs.statSync(full);
            return { name: f, size: st.size, mtime: st.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
});

ipcMain.handle('review:read', (_e, name) => {
    const full = path.join(reviewDir(), path.basename(String(name)));
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full, 'utf8');
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

    app.whenReady().then(() => {
        Menu.setApplicationMenu(null); // 去掉默认菜单（含开发者工具入口）
        createWindow();
        createTray();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
            else mainWindow?.show();
        });
    });

    app.on('before-quit', () => { quitting = true; });
    // 托盘常驻：关掉所有窗口也不退出
    app.on('window-all-closed', () => { /* 保留托盘 */ });
}
