import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

/* ---------- 1. 导入即自动切分（上传后不需要再点按钮） ---------- */
{
    const p = path.join(root, 'src', 'pages', 'ReviewDetail.tsx');
    let s = fs.readFileSync(p, 'utf8');

    // split 支持传入文本，便于上传后自动调用
    s = s.replace(
        '    const split = async () => {\n        if (text.trim().length < 10) { push(\'请先提供试卷内容\', \'bad\'); return; }',
        '    const split = async (overrideText?: string) => {\n        const source = (overrideText ?? text).trim();\n        if (source.length < 10) { push(\'请先提供试卷内容\', \'bad\'); return; }'
    );
    s = s.replace(
        "                { body: { text, type: type || undefined } }",
        "                { body: { text: source, type: type || undefined } }"
    );

    // 上传成功后直接切分 + 落库，不再停在“开始切分”
    s = s.replace(
        `            setText(r.text);
            push(\`\${r.note || '解析完成'}（\${r.text.length} 字符）\`, 'ok');
            setTab('paste');`,
        `            setText(r.text);
            push(\`\${r.note || '解析完成'}（\${r.text.length} 字符），正在自动切分…\`, 'ok');
            setTab('paste');
            // 全自动：解析完立刻切分并落库，老师不需要再点任何按钮
            await split(r.text);`
    );

    fs.writeFileSync(p, s, 'utf8');
    console.log('导入流程：上传后自动切分并落库');
}

/* ---------- 2. CI 只构建 Tauri（Electron 改为本地构建） ---------- */
{
    const p = path.join(root, '..', '.github', 'workflows', 'desktop.yml');
    let y = fs.readFileSync(p, 'utf8');
    // 去掉整个 Electron job，只保留 Tauri
    const start = y.indexOf('  electron:');
    const end = y.indexOf('  tauri:');
    if (start >= 0 && end > start) {
        y = y.slice(0, start) + y.slice(end);
    }
    y = y.replace('name: 桌面端构建', 'name: 桌面端构建（Tauri）');
    fs.writeFileSync(p, y, 'utf8');
    console.log('CI：只保留 Tauri 构建，Electron 改本地打包');
}
