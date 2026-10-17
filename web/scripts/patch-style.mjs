import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const log = (m) => console.log(m);

/* 1) index.html：引入 jsDelivr 上的 Liberation Serif */
{
    const p = path.join(root, 'index.html');
    let h = fs.readFileSync(p, 'utf8');
    if (!h.includes('liberation-serif')) {
        const links = [
            '    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />',
            '    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/liberation-serif@5.0.12/400.css" />',
            '    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/liberation-serif@5.0.12/700.css" />',
            '    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/liberation-serif@5.0.12/400-italic.css" />'
        ].join('\n');
        h = h.replace('</head>', links + '\n</head>');
        fs.writeFileSync(p, h, 'utf8');
        log('index.html：已加入 Liberation Serif');
    } else {
        log('index.html：字体已存在');
    }
}

/* 2) global.css：阅读字体变量 */
{
    const p = path.join(root, 'src', 'styles', 'global.css');
    let c = fs.readFileSync(p, 'utf8');
    if (!c.includes('--font-reading')) {
        c = c.replace(
            '    --font-mono:',
            "    /* 英文正文：Liberation Serif（jsDelivr 加载），中文回落到系统衬线 */\n    --font-reading: 'Liberation Serif', 'Songti SC', 'Source Han Serif SC', 'Noto Serif SC', Georgia, serif;\n    --font-mono:"
        );
        fs.writeFileSync(p, c, 'utf8');
        log('global.css：已加入 --font-reading');
    } else {
        log('global.css：变量已存在');
    }
}

/* 3) detail.css：正文放大、衬线、版心加宽 */
{
    const p = path.join(root, 'src', 'styles', 'detail.css');
    let d = fs.readFileSync(p, 'utf8');
    const before = d;
    d = d.replace('font-size: 15.5px;\n    line-height: 1.95;', 'font-size: 17.5px;\n    line-height: 2.05;');
    d = d.replace('font-family: var(--font-sans);\n    max-height: calc(100vh - var(--nav-h) - 150px);', 'font-family: var(--font-reading);\n    max-height: calc(100vh - var(--nav-h) - 150px);');
    d = d.replace('max-width: 1560px;', 'max-width: 1760px;');
    // 选项与讲评正文也用衬线（英文句子多）
    d = d.replace('.rd-option {\n    display: flex;', '.rd-option {\n    font-family: var(--font-reading);\n    font-size: 15px;\n    display: flex;');
    d = d.replace('.rd-long-en {\n    font-weight: 600;', ".rd-long-en {\n    font-family: var(--font-reading);\n    font-size: 14.5px;\n    font-weight: 600;");
    if (d !== before) {
        fs.writeFileSync(p, d, 'utf8');
        log('detail.css：阅读区字体与版心已调整');
    } else {
        log('detail.css：无需调整');
    }
}
