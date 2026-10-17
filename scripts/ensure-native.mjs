#!/usr/bin/env node
/**
 * 确保原生模块 better-sqlite3 的二进制存在。
 *
 * 为什么要这个脚本：
 *   better-sqlite3 的 install 脚本是 `prebuild-install || node-gyp rebuild`，
 *   在 pnpm 工作区里依赖的 bin 不一定能被解析到，装完可能缺 better_sqlite3.node，
 *   运行时才报 MODULE_NOT_FOUND。这里在 postinstall 阶段兜底：
 *     1) 用 npx 跑 prebuild-install（下载官方预编译包）
 *     2) 失败则用 npx 跑 node-gyp rebuild（需要 Python3 + C++ 工具链，CI 自带）
 *
 * 不依赖本仓库的依赖解析，避免 pnpm 的 node_modules 结构差异。
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const serverRequire = createRequire(new URL('../server/package.json', import.meta.url));

const log = (m) => console.log(`[ensure-native] ${m}`);

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

/** Electron 运行时下必须用真实 node 并带 ELECTRON_RUN_AS_NODE */
const isElectron = !!process.versions.electron;
const nodeBin = process.env.npm_node_execpath || (isElectron ? 'node' : process.execPath);
const childEnv = { ...process.env, ...(isElectron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };

function runNpx(args) {
    // Windows 上 npx 是 npx.cmd
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    try {
        execFileSync(npx, ['-y', ...args], { cwd: pkgDir, stdio: 'inherit', env: childEnv, shell: process.platform === 'win32' });
        return fs.existsSync(binary);
    } catch {
        return false;
    }
}

log('缺少 better-sqlite3 二进制，先尝试下载预编译包...');
let ok = runNpx(['prebuild-install@7', '--verbose']);

if (!ok) {
    log('预编译包不可用（网络或 Node ABI 不匹配），改为本地编译（需要 Python3 与 C++ 工具链）...');
    ok = runNpx(['node-gyp@11', 'rebuild', '--release']);
}

if (ok) {
    log('better-sqlite3 二进制已就绪');
    process.exit(0);
}

log('三种方式都失败了，可参考：');
log('  1) 配置代理后重试：pnpm rebuild better-sqlite3');
log('  2) 国内镜像：better_sqlite3_binary_host=https://registry.npmmirror.com/-/binary/better-sqlite3 pnpm install');
log('  3) 手动编译：cd ' + pkgDir + ' && npx -y node-gyp rebuild --release');
process.exit(1);
