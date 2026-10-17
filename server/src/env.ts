import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
/** 项目根目录（server/dist 或 server/src 的上两级） */
export const ROOT = path.resolve(here, '..', '..');
/** 服务器工作目录：数据库、上传缓存等都放这里 */
export const SERVER_ROOT = path.resolve(here, '..');

dotenv.config({ path: path.join(ROOT, '.env') });
dotenv.config({ path: path.join(SERVER_ROOT, '.env') });

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const bool = (v: string | undefined, d = false) => (v === undefined ? d : /^(1|true|yes|on)$/i.test(v));

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num(process.env.PORT, 3901),
  host: process.env.HOST || '127.0.0.1',
  siteUrl: (process.env.SITE_URL || 'http://localhost:3901').replace(/\/+$/, ''),

  jwtSecret: process.env.JWT_SECRET || '',
  /** 首个管理员邮箱：该邮箱首次登录即为管理员 */
  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase(),

  dbFile: process.env.DB_FILE || path.join(SERVER_ROOT, 'data', 'zhuopu.db'),

  mail: {
    host: process.env.SMTP_HOST || 'smtp.exmail.qq.com',
    port: num(process.env.SMTP_PORT, 465),
    secure: bool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER || 'noreply@xuanjian.top',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || '琢璞英语讲评工作台'
  },

  qiniu: {
    accessKey: process.env.QINIU_ACCESS_KEY || '',
    secretKey: process.env.QINIU_SECRET_KEY || '',
    bucket: process.env.QINIU_BUCKET || 'zhuopu',
    region: process.env.QINIU_REGION || 'as0',
    domain: (process.env.QINIU_DOMAIN || 'https://cdn.zp.xuanjian.top').replace(/\/+$/, ''),
    /** 上传凭证有效期（秒） */
    tokenTtl: num(process.env.QINIU_TOKEN_TTL, 3600)
  },

  mineru: {
    token: process.env.MINERU_TOKEN || '',
    baseUrl: (process.env.MINERU_BASE_URL || 'https://mineru.net').replace(/\/+$/, ''),
    modelVersion: process.env.MINERU_MODEL || 'vlm',
    pollIntervalMs: num(process.env.MINERU_POLL_INTERVAL_MS, 4000),
    timeoutMs: num(process.env.MINERU_TIMEOUT_MS, 300000)
  },

  llm: {
    deepseek: {
      baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
    },
    glm: {
      baseUrl: (process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, ''),
      apiKey: process.env.GLM_API_KEY || '',
      model: process.env.GLM_MODEL || 'glm-4.6v-flash'
    }
  },

  /** 邮箱验证码 */
  code: {
    ttlMinutes: num(process.env.CODE_TTL_MINUTES, 10),
    resendSeconds: num(process.env.CODE_RESEND_SECONDS, 60),
    maxPerEmailPerHour: num(process.env.CODE_MAX_PER_EMAIL_PER_HOUR, 8),
    maxPerIpPerHour: num(process.env.CODE_MAX_PER_IP_PER_HOUR, 30)
  }
} as const;

export function assertEnv(): void {
  const missing: string[] = [];
  if (!env.jwtSecret || env.jwtSecret.length < 32) missing.push('JWT_SECRET（至少 32 字符）');
  if (!env.mail.pass) missing.push('SMTP_PASS');
  if (missing.length) {
    throw new Error(`缺少必要环境变量：${missing.join('、')}（请参考 .env.example）`);
  }
}

export function ensureDir(p: string): string {
  fs.mkdirSync(p, { recursive: true });
  return p;
}
