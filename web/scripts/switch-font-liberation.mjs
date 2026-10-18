import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');          // web/
const repo = path.resolve(root, '..');
const fontSrc = path.join(repo, '_font');
const fontDest = path.join(root, 'public', 'fonts');

/* ---------- 1. 装入 Liberation Serif（四款字重/字形） ---------- */
const wanted = [
    ['LiberationSerif-Regular.ttf', 'LiberationSerif-Regular.ttf'],
    ['LiberationSerif-Bold.ttf', 'LiberationSerif-Bold.ttf'],
    ['LiberationSerif-Italic.ttf', 'LiberationSerif-Italic.ttf'],
    ['LiberationSerif-BoldItalic.ttf', 'LiberationSerif-BoldItalic.ttf']
];
fs.mkdirSync(fontDest, { recursive: true });
for (const [from, to] of wanted) {
    const src = path.join(fontSrc, from);
    if (!fs.existsSync(src)) { console.log(`缺少 ${from}`); continue; }
    fs.copyFileSync(src, path.join(fontDest, to));
    console.log(`已装入 ${to}（${fs.statSync(src).size} B）`);
}

/* ---------- 2. @font-face 改为 Liberation Serif ---------- */
const cssPath = path.join(root, 'src', 'styles', 'global.css');
let css = fs.readFileSync(cssPath, 'utf8');

const faces = `/* 英文正文衬线体：Liberation Serif（SIL OFL，随应用打包，三端共用同一份） */
@font-face {
    font-family: 'Zhuopu Serif';
    src: url('/fonts/LiberationSerif-Regular.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
        U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
    font-family: 'Zhuopu Serif';
    src: url('/fonts/LiberationSerif-Bold.ttf') format('truetype');
    font-weight: 700;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
        U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
    font-family: 'Zhuopu Serif';
    src: url('/fonts/LiberationSerif-Italic.ttf') format('truetype');
    font-weight: 400;
    font-style: italic;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
        U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
    font-family: 'Zhuopu Serif';
    src: url('/fonts/LiberationSerif-BoldItalic.ttf') format('truetype');
    font-weight: 700;
    font-style: italic;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
        U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}`;

// 替换掉原先的单条 @font-face 块（含注释）
css = css.replace(/\/\* 英文正文衬线体[\s\S]*?@font-face \{[\s\S]*?\}\n?/, faces + '\n');
if (!css.includes('LiberationSerif-Regular.ttf')) {
    css = faces + '\n' + css;
}
css = css.replace(
    /--font-reading:[^;]+;/,
    "--font-reading: 'Zhuopu Serif', 'Liberation Serif', 'Songti SC', 'Source Han Serif SC', 'Noto Serif SC', Georgia, serif;"
);
fs.writeFileSync(cssPath, css, 'utf8');
console.log('global.css：@font-face 已切到 Liberation Serif（400/700/斜体）');

/* ---------- 3. 清理不再使用的字体文件 ---------- */
for (const stale of ['TimesNewRoman.ttf', 'CrimsonText-Regular.ttf']) {
    const p = path.join(fontDest, stale);
    if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`已移除 ${stale}`); }
}
