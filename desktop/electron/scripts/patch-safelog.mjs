import fs from 'node:fs';
import path from 'node:path';

const p = path.resolve(import.meta.dirname, '..', 'electron', 'main.cjs');
let s = fs.readFileSync(p, 'utf8');

/* 1) 统一的 safeLog：主进程日志写文件，stdout 断开（EPIPE）时不抛异常 */
if (!s.includes('function safeLog')) {
    const anchor = "const { URL } = require('node:url');";
    const impl = [
        anchor,
        '',
        '/**',
        ' * 主进程日志：写入 userData/main.log，同时尽量输出到 stdout。',
        ' * 启动它的终端关闭后 stdout 会 EPIPE，直接 console.log 会让主进程抛未捕获异常并弹错误框。',
        ' */',
        "const LOG_DIR = (() => { try { return app.getPath('userData'); } catch { return require('node:os').tmpdir(); } })();",
        'const LOG_FILE = require(\'node:path\').join(LOG_DIR, \'main.log\');',
        'function safeLog(...args) {',
        "    const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');",
        "    try { fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + line + '\\n'); } catch { /* 忽略 */ }",
        "    try { process.stdout.write(line + '\\n'); } catch { /* EPIPE 忽略 */ }",
        '}'
    ].join('\n');
    s = s.replace(anchor, impl);
}

/* 2) 全局兜底：EPIPE 之类的未捕获异常不再弹窗 */
if (!s.includes('uncaughtException')) {
    s = s.replace(
        'const gotLock = app.requestSingleInstanceLock();',
        [
            "process.on('uncaughtException', (e) => {",
            "    if (e && e.code === 'EPIPE') return;",
            "    safeLog('[未捕获异常]', (e && e.stack) || e);",
            '});',
            "process.on('unhandledRejection', (e) => {",
            "    safeLog('[未处理 Promise]', (e && e.message) || e);",
            '});',
            '',
            'const gotLock = app.requestSingleInstanceLock();'
        ].join('\n')
    );
}

/* 3) 其它 console 调用换成 safeLog */
s = s.replace(/console\.log\(/g, 'safeLog(').replace(/console\.error\(/g, 'safeLog(');

fs.writeFileSync(p, s, 'utf8');
console.log('已接入 safeLog 与全局异常兜底');
