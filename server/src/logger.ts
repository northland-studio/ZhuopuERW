/** 极简日志：带时间戳与级别，生产环境可直接被 pm2 收集 */
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function fmt(args: unknown[]): string {
    return args
        .map((a) => {
            if (typeof a === 'string') return a;
            if (a instanceof Error) return `${a.message}${a.stack ? '\n' + a.stack.split('\n').slice(0, 4).join('\n') : ''}`;
            try { return JSON.stringify(a); } catch { return String(a); }
        })
        .join(' ');
}

export const logger = {
    info: (...a: unknown[]) => console.log(`[${ts()}] [INFO] ${fmt(a)}`),
    warn: (...a: unknown[]) => console.warn(`[${ts()}] [WARN] ${fmt(a)}`),
    error: (...a: unknown[]) => console.error(`[${ts()}] [ERROR] ${fmt(a)}`),
    debug: (...a: unknown[]) => {
        if (process.env.DEBUG_LOG === '1') console.log(`[${ts()}] [DEBUG] ${fmt(a)}`);
    }
};
