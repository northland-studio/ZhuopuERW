import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(root, '..');

/* 1) 把 _font 里的 Crimson Text 复制进 web/public/fonts，供浏览器/Tauri/Electron 一起打包 */
{
    const src = path.join(repo, '_font', 'CrimsonText-Regular-5.ttf');
    const dir = path.join(root, 'public', 'fonts');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, path.join(dir, 'CrimsonText-Regular.ttf'));
    console.log('字体已复制：public/fonts/CrimsonText-Regular.ttf');
}

/* 2) index.html：改本地字体、图标换校徽、去掉 jsDelivr */
{
    const p = path.join(root, 'index.html');
    let h = fs.readFileSync(p, 'utf8');
    h = h.replace(/\s*<link rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net"[^>]*>/g, '');
    h = h.replace(/\s*<link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net[^>]*>/g, '');
    h = h.replace('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
        '<link rel="icon" href="/brand/logo.png" type="image/png" />\n    <link rel="preload" href="/fonts/CrimsonText-Regular.ttf" as="font" type="font/ttf" crossorigin />');
    fs.writeFileSync(p, h, 'utf8');
    console.log('index.html：字体本地化 + 图标换校徽');
}

/* 3) global.css：@font-face + 阅读字体指向 Crimson Text */
{
    const p = path.join(root, 'src', 'styles', 'global.css');
    let c = fs.readFileSync(p, 'utf8');
    if (!c.includes('CrimsonText-Regular')) {
        const face = `/* 英文正文衬线体：随应用打包，Tauri / Electron / 浏览器共用同一份 */
@font-face {
    font-family: 'Zhuopu Serif';
    src: url('/fonts/CrimsonText-Regular.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
}
`;
        c = face + '\n' + c;
    }
    c = c.replace(
        /--font-reading:[^;]+;/,
        "--font-reading: 'Zhuopu Serif', 'Crimson Text', 'Liberation Serif', 'Songti SC', Georgia, serif;"
    );
    fs.writeFileSync(p, c, 'utf8');
    console.log('global.css：@font-face 与 --font-reading 已指向 Crimson Text');
}

/* 4) detail.css：选项不挤压、可横向滑动、底部长难句栏 */
{
    const p = path.join(root, 'src', 'styles', 'detail.css');
    let d = fs.readFileSync(p, 'utf8');

    // 题目卡片不允许被压缩（展开时挤扁兄弟节点）
    if (!d.includes('flex: 0 0 auto')) {
        d = d.replace('.rd-q {\n    border: 1px solid var(--ink-100);', '.rd-q {\n    flex: 0 0 auto;\n    border: 1px solid var(--ink-100);');
    }
    // 选项区与单个选项支持横向滚动（长选项不再被裁切）
    if (!d.includes('scroll-options')) {
        d += `
/* 选项区与单个选项：长文本横向可滚动，不再被裁切 */
.rd-options-scroll {
    overflow-x: auto;
    overscroll-behavior-x: contain;
    padding-bottom: 4px;
}
.rd-option {
    min-width: max-content;
    white-space: pre-wrap;
    word-break: keep-all;
}
.rd-option-scroll {
    overflow-x: auto;
    overscroll-behavior-x: contain;
    border-radius: 8px;
}
.rd-option-scroll::-webkit-scrollbar {
    height: 6px;
}
.rd-option-scroll::-webkit-scrollbar-thumb {
    background: var(--ink-300);
    border-radius: 99px;
}

/* 底部：每篇原文的长难句汇总栏 */
.rd-longbar {
    grid-column: 1 / -1;
    margin-top: 6px;
    background: #fff;
    border: 1px solid var(--ink-100);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
}
.rd-longbar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--ink-100);
    font-size: 13.5px;
    font-weight: 650;
    color: var(--ink-600);
}
.rd-longbar-body {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 16px;
    padding: 18px 20px 22px;
    max-height: 42vh;
    overflow-y: auto;
}
.rd-longbar-group-title {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--brand-700);
    letter-spacing: 0.04em;
    margin-bottom: 8px;
}
.rd-longbar-group .rd-long {
    font-family: var(--font-reading);
    font-size: 14.5px;
}
`;
    }
    fs.writeFileSync(p, d, 'utf8');
    console.log('detail.css：选项滚动 + 卡片不压缩 + 底部长难句栏样式');
}
