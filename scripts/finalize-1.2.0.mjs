import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

/* 1) CHANGELOG 追加 v1.2.0 */
{
    const p = path.join(root, 'CHANGELOG.md');
    const old = fs.readFileSync(p, 'utf8');
    const entry = `## v1.2.0

### 新功能

- 讲评页字号调节：右下角浮动 A- / A+ 五档（小、标准、大、特大、超大），仅作用于讲评页的原文与题目，按设备记忆
- 讲评页新增「原文对照」栏：位于导航栏与「原文 / 题目」两栏之间，只展示当前选中题目在原文中的对应整句（含题号与题型），在线讲评与离线讲评一致
- 网页版新增下载页 /download：提供桌面客户端下载与使用说明；桌面客户端自动隐藏导航入口，直接访问时提示用浏览器打开

### 改进

- 桌面端只构建 Windows 版本；Tauri 改为输出便携 zip（单个可执行文件 + review 文件夹），Electron 保持安装包
- CI 构建的 Tauri 便携包与 Electron 安装包自动上传到七牛 CDN（bucket zhuopu，域名 cdn.zp.xuanjian.top），下载页直链引用同一版本路径
- 版本号统一升级到 1.2.0（根包、Electron、Tauri、Cargo）

`;
    const marker = '## v0.1.0';
    if (!old.includes('## v1.2.0')) {
        const idx = old.indexOf(marker);
        const out = idx >= 0 ? old.slice(0, idx) + entry + old.slice(idx) : old + '\n' + entry;
        fs.writeFileSync(p, out, 'utf8');
        console.log('CHANGELOG.md 已追加 v1.2.0');
    } else {
        console.log('CHANGELOG.md 已有 v1.2.0');
    }
}

/* 2) .gitignore 忽略临时产物目录 */
{
    const p = path.join(root, '.gitignore');
    let s = fs.readFileSync(p, 'utf8');
    const add = ['_tauri_zip/', '_tauri_dl/', '_upd/', '_tauri_dl', '_probe.txt'];
    const lines = s.split('\n');
    for (const item of add) {
        if (!lines.includes(item)) lines.push(item);
    }
    fs.writeFileSync(p, lines.join('\n'), 'utf8');
    console.log('.gitignore 已补充临时目录');
}
