import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';
import { logger } from '../logger.js';

export const APP_NAME = '琢璞英语讲评工作台';

let transporter: Transporter | null = null;
const state = {
    lastOkAt: '',
    lastErrorAt: '',
    lastError: ''
};

function transport(): Transporter {
    if (transporter) return transporter;
    transporter = nodemailer.createTransport({
        host: env.mail.host,
        port: env.mail.port,
        secure: env.mail.secure,
        auth: { user: env.mail.user, pass: env.mail.pass },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000
    });
    return transporter;
}

const raw = (e: unknown) => String((e as { response?: string; message?: string })?.response || (e as Error)?.message || e);
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/** 现场登录自检（不发信），用于启动检查与后台状态页 */
export async function verifyMail(): Promise<{ ok: boolean; error?: string }> {
    try {
        await transport().verify();
        state.lastOkAt = stamp();
        logger.info(`邮件通道自检通过（${env.mail.user}）`);
        return { ok: true };
    } catch (e) {
        state.lastError = raw(e);
        state.lastErrorAt = stamp();
        logger.error(`邮件通道自检失败：${state.lastError}`);
        return { ok: false, error: state.lastError };
    }
}

export function mailState() {
    return { ...state, host: env.mail.host, port: env.mail.port, user: env.mail.user, fromName: env.mail.fromName };
}

async function send(to: string, subject: string, html: string, text: string): Promise<void> {
    try {
        await transport().sendMail({
            from: `"${env.mail.fromName}" <${env.mail.user}>`,
            to,
            subject,
            text,
            html
        });
        state.lastOkAt = stamp();
    } catch (e) {
        state.lastError = raw(e);
        state.lastErrorAt = stamp();
        logger.error(`邮件发送失败（${to}）：${state.lastError}`);
        throw Object.assign(new Error('邮件发送失败，请稍后重试或联系管理员'), { status: 502 });
    }
}

/** 统一的邮件外壳：主题色 #980B0E，无图标、无 emoji */
function shell(title: string, bodyHtml: string, footerNote = ''): string {
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
    <tr><td style="background:#980B0E;padding:24px 28px;">
      <div style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.5px;">${APP_NAME}</div>
      <div style="color:rgba(255,255,255,0.78);font-size:12px;margin-top:6px;">Zhuopu English Review Workspace</div>
    </td></tr>
    <tr><td style="padding:28px;">${bodyHtml}</td></tr>
    <tr><td style="padding:0 28px 24px;color:#9a9a9a;font-size:12px;line-height:1.7;">
      ${footerNote || '本邮件由系统自动发送，请勿直接回复。'}
    </td></tr>
  </table>
  <div style="max-width:560px;margin:16px auto 0;color:#b0b0b0;font-size:12px;text-align:center;">北域工作室 Northland Studio</div>
</td></tr></table></body></html>`;
}

/** 登录/重置验证码 */
export async function sendCodeMail(to: string, code: string, purpose: 'login' | 'reset', ttlMinutes: number): Promise<void> {
    const action = purpose === 'reset' ? '重置密码' : '登录';
    const html = shell(
        `${action}验证码`,
        `<p style="margin:0 0 12px;color:#333;font-size:15px;">你正在${action}${APP_NAME}，验证码如下：</p>
         <div style="margin:18px 0;padding:18px;background:#faf6f6;border:1px solid #f0dcdc;border-radius:10px;text-align:center;">
           <span style="font-family:'SF Mono',Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:#980B0E;">${code}</span>
         </div>
         <p style="margin:0;color:#666;font-size:13px;line-height:1.8;">验证码 ${ttlMinutes} 分钟内有效，仅可使用一次。<br>如果不是你本人操作，请忽略本邮件。</p>`
    );
    await send(to, `【${APP_NAME}】${action}验证码：${code}`, html, `你的${action}验证码是 ${code}，${ttlMinutes} 分钟内有效。`);
}

/** 重置密码链接（链接里带一次性 token） */
export async function sendResetMail(to: string, link: string, ttlMinutes: number): Promise<void> {
    const html = shell(
        '重置密码',
        `<p style="margin:0 0 14px;color:#333;font-size:15px;">点击下面的按钮重置密码：</p>
         <p style="margin:20px 0;">
           <a href="${link}" style="display:inline-block;background:#980B0E;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-size:15px;font-weight:600;">重置密码</a>
         </p>
         <p style="margin:0;color:#666;font-size:13px;line-height:1.8;">链接 ${ttlMinutes} 分钟内有效，仅可使用一次。<br>如果按钮无法点击，请复制下面的地址到浏览器打开：<br>
         <span style="word-break:break-all;color:#980B0E;">${link}</span></p>`
    );
    await send(to, `【${APP_NAME}】重置密码`, html, `请打开以下链接重置密码（${ttlMinutes} 分钟内有效）：${link}`);
}
