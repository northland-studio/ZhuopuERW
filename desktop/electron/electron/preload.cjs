/**
 * 预加载脚本：把有限的原生能力暴露给渲染进程（contextIsolation 开启，不泄露 Node）
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zhuopuDesktop', {
    platform: process.platform,
    isDesktop: true,

    // 窗口控制（对应前端自定义顶部操作栏）
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

    info: () => ipcRenderer.invoke('app:info'),

    // 文件版讲评（review 文件夹）
    review: {
        list: () => ipcRenderer.invoke('review:list'),
        read: (name) => ipcRenderer.invoke('review:read', name),
        write: (name, content) => ipcRenderer.invoke('review:write', name, content),
        remove: (name) => ipcRenderer.invoke('review:delete', name),
        reveal: () => ipcRenderer.invoke('review:reveal')
    },

    // 系统文件选择（返回 base64，前端直接当 File 用）
    pickFile: () => ipcRenderer.invoke('file:pick')
});
