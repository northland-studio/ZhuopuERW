#!/usr/bin/env node
/**
 * 确保原生模块 better-sqlite3 的二进制存在。
 *
 * 背景：better-sqlite3 的 install 脚本是 `prebuild-install || node-gyp rebuild`。
 * 在 pnpm 工作区里，安装脚本的执行时机与 link 顺序不一定能拿到 prebuild-install 的 bin，
 * 于是会出现「装完了但 require 报 MODULE_NOT_FOUND」的情况。
 * 这个脚本在 postinstall 阶段兜底：缺二进制就自己跑一次 prebuild-install。
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
/** better-sqlite3 是 server 工作区的依赖，从 server 目录解析 */
const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));

function log(msg) { console.log(`[ensure-native] ${msg}`); }

let pkgJson;
try {
    pkgJson = serverRequire.resolve('better-sqlite3/package.json');
} catch {
    try {
        pkgJson = require.resolve('better-sqlite3/package.json');
    } catch {
        log('未安装 better-sqlite3，跳过');
        process.exit(0);
    }
}

const pkgDir = path.dirname(pkgJson);
const binary = path.join(pkgDir, 'build', 'Release', 'better_sqlite3.node');

if (fs.existsSync(binary)) {
    log(`better-sqlite3 二进制已就绪：${path.relative(process.cwd(), binary)}`);
    process.exit(0);
}

log('缺少 better-sqlite3 二进制，尝试 prebuild-install 下载预编译包...');
try {
    // 注意：本仓库的工作区 pnpm 可能跑在 Electron 运行时里（process.execPath 是 Electron），
    // 此时必须用真实 node 并带上 ELECTRON_RUN_AS_NODE，否则子进程解析不到模块。
    const isElectron = !!process.versions.electron;
    const runtime = process.env.npm_node_execpath || (isElectron ? 'node' : process.execPath);
    execFileSync(runtime, [require.resolve('prebuild-install/bin.js')], {
        cwd: pkgDir,
        stdio: 'inherit',
        env: { ...process.env, ...(isElectron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }
    });
} catch {
    log('prebuild-install 失败（可能无法访问 GitHub Releases）。');
    log('可用以下方式之一解决：');
    log('  1) 配置代理后重试：pnpm rebuild better-sqlite3');
    log('  2) 使用国内镜像：设置环境变量 better_sqlite3_binary_host=https://registry.npmmirror.com/-/binary/better-sqlite3 后重试');
    log('  3) 安装编译工具链后本地编译：cd "' + pkgDir + '" && npx node-gyp rebuild --release');
    process.exit(fs.existsSync(binary) ? 0 : 1);
}

if (fs.existsSync(binary)) {
    log('better-sqlite3 二进制已就绪');
} else {
    log('仍然缺少 better-sqlite3 二进制，请按上面的提示处理');
    process.exit(1);
}
