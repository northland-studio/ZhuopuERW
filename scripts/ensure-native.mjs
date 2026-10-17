#!/usr/bin/env node
/**
 * 确保原生模块 better-sqlite3 的二进制存在。
 *
 * 背景：better-sqlite3 的 install 脚本是 `prebuild-install || node-gyp rebuild`。
 * 在 pnpm 工作区里，安装脚本的执行时机与 link 顺序不一定能拿到 prebuild-install 的 bin，
 * 于是会出现「装完了但 require 报 MODULE_NOT_FOUND」。
 * 这里在 postinstall 阶段兜底：先试预编译包，失败再本地编译（CI 的 Ubuntu 自带工具链）。
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

/** Electron 运行时下要用真实 node，否则子进程解析不到模块 */
const isElectron = !!process.versions.electron;
const runtime = process.env.npm_node_execpath || (isElectron ? 'node' : process.execPath);
const childEnv = { ...process.env, ...(isElectron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };

function tryRun(label, bin, args) {
    try {
        execFileSync(bin, args, { cwd: pkgDir, stdio: 'inherit', env: childEnv });
        return fs.existsSync(binary);
    } catch {
        log(`${label} 失败`);
        return false;
    }
}

log('缺少 better-sqlite3 二进制，先尝试下载预编译包...');
let ok = tryRun('prebuild-install', runtime, [require.resolve('prebuild-install/bin.js')]);

if (!ok) {
    log('预编译包不可用（网络或版本不匹配），改为本地编译（需要 Python3 与 C++ 工具链）...');
    ok = tryRun('node-gyp', runtime, [require.resolve('node-gyp/bin/node-gyp.js'), 'rebuild', '--release']);
}

if (ok) {
    log('better-sqlite3 二进制已就绪');
    process.exit(0);
}

log('三种方式都失败了，可参考：');
log('  1) 配置代理后重试：pnpm rebuild better-sqlite3');
log('  2) 国内镜像：better_sqlite3_binary_host=https://registry.npmmirror.com/-/binary/better-sqlite3 pnpm install');
log('  3) 安装编译工具链后手动编译：npx node-gyp rebuild --release');
process.exit(1);
