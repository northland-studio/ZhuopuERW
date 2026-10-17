# 琢璞英语讲评工作台 · 桌面端

三个客户端共享 `web/` 这一套前端代码，只是外壳不同：

| 客户端 | 目录 | 用途 |
| --- | --- | --- |
| 浏览器 | `web/` | 主要网络客户端，部署在 https://zhuopu.xuanjian.top |
| Electron | `desktop/electron/` | 教师个人电脑主力客户端（大体积安装包） |
| Tauri | `desktop/tauri/` | U 盘移动版、离线轻量客户端（单文件小体积） |

## 原生能力（两端一致）

- 系统托盘：显示主窗口 / 隐藏到托盘 / 打开讲评文件夹 / 打开网页版 / 退出
- 无边框窗口 + 前端自绘顶部操作栏（`web/src/components/DesktopTitleBar.tsx`）
- 禁用开发者工具与右键菜单，屏蔽 F12、Ctrl+Shift+I、Ctrl+U
- 关闭按钮只收进托盘，真正退出走托盘菜单
- 读写程序目录下的 `review/` 文件夹（文件版讲评，断网可用）
- 单实例运行（Electron）

## 运行

### Electron

```bash
cd desktop/electron
pnpm install
pnpm start          # 开发（默认连 http://127.0.0.1:5173，可改 ZHUOPU_DEV_URL）
pnpm pack:win       # 打 Windows 安装包
```

打包前先把前端产物放到 `desktop/electron/web-dist`：

```bash
cd web && pnpm build && cp -r dist ../desktop/electron/web-dist
```

### Tauri

需要 Rust 工具链与系统依赖（Windows 需 WebView2）。

```bash
cd desktop/tauri/src-tauri
cargo tauri dev     # 开发
cargo tauri build   # 打包
```

`tauri.conf.json` 的 `frontendDist` 指向 `../../web/dist`，字体与校徽通过 `bundle.resources` 一起打进包内。

## 与网页端的差异

- 网页端不渲染顶部操作栏（`hasDesktop()` 为 false），右键与快捷键不拦截
- 桌面端 `body.is-desktop` 会给顶部操作栏让出 38px 高度
- 文件版讲评只在桌面端可用：导出到 `review/` 目录即可在断网的一体机上打开
