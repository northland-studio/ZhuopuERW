import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cssFiles = ['src/styles/global.css', 'src/styles/detail.css', 'src/styles/home.css', 'src/styles/layout.css'];

/* 1) global.css：@font-face 加 unicode-range，中文字符直接走系统字体，避免无谓等待 */
{
    const p = path.join(root, 'src/styles/global.css');
    let c = fs.readFileSync(p, 'utf8');
    c = c.replace(
        /@font-face \{[^}]*\}/,
        `@font-face {
    font-family: 'Zhuopu Serif';
    src: url('/fonts/CrimsonText-Regular.ttf') format('truetype');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
    /* 只覆盖拉丁字母与常用标点：中文继续用系统衬线，避免首屏闪烁 */
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
        U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}`
    );
    fs.writeFileSync(p, c, 'utf8');
    console.log('global.css：@font-face 增加 unicode-range');
}

/* 2) 把所有「英文正文」的地方都挂上阅读字体 */
{
    const p = path.join(root, 'src/styles/detail.css');
    let d = fs.readFileSync(p, 'utf8');
    if (!d.includes('/* 英文正文统一使用随包衬线体')) {
        d += `
/* 英文正文统一使用随包衬线体（题干、选项、原文、长难句、注释里的英文） */
.brand-en,
.rd-text,
.rd-option,
.rd-option-scroll,
.rd-long-en,
.rd-q-head .rd-q-stem,
.rd-pop-word,
.rd-vocab-chip,
.share-question,
.check-hint {
    font-family: var(--font-reading);
}

/* 题干与选项里的英文行高略放大，接近讲义排版 */
.rd-option {
    line-height: 1.7;
}
.rd-option-scroll {
    display: inline-block;
}
`;
        fs.writeFileSync(p, d, 'utf8');
        console.log('detail.css：英文正文统一用阅读字体');
    }
}

/* 3) 品牌副标题（导航栏里的英文）也用同一套字体 */
{
    const p = path.join(root, 'src/styles/layout.css');
    let l = fs.readFileSync(p, 'utf8');
    l = l.replace(
        '.brand-en {\n    font-size: 9.5px;',
        ".brand-en {\n    font-family: var(--font-reading);\n    font-size: 9.5px;"
    );
    fs.writeFileSync(p, l, 'utf8');
    console.log('layout.css：品牌副标题改用阅读字体');
}

/* 4) 题干外层加一个类名，方便上面那条规则命中 */
{
    const p = path.join(root, 'src/pages/ReviewDetail.tsx');
    let s = fs.readFileSync(p, 'utf8');
    if (!s.includes('rd-q-stem')) {
        s = s.replace(
            '<span className="tiny" style={{ display: \'block\', color: \'var(--ink-700)\' }}>',
            '<span className="tiny rd-q-stem" style={{ display: \'block\', color: \'var(--ink-700)\' }}>'
        );
        fs.writeFileSync(p, s, 'utf8');
        console.log('ReviewDetail：题干加 rd-q-stem 类名');
    } else {
        console.log('ReviewDetail：已有 rd-q-stem');
    }
}
