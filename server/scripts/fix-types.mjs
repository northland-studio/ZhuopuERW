import fs from 'node:fs';
import path from 'node:path';

const p = path.resolve(import.meta.dirname, '..', 'src', 'middleware', 'auth.ts');
let s = fs.readFileSync(p, 'utf8');

// 1) 用全局命名空间扩展 Express.Request（比 declare module 在 NodeNext 下更稳）
s = s.replace(
    `declare module 'express-serve-static-core' {
    interface Request {
        user?: { id: number; role: Role; email: string; username: string };
    }
}`,
    `declare global {
    namespace Express {
        interface Request {
            user?: { id: number; role: Role; email: string; username: string };
        }
    }
}`
);

// 2) jwt.sign 的 expiresIn 用 SignOptions 约束，避免重载报错
s = s.replace(
    `export function signToken(uid: number, role: Role, expiresIn = '30d'): string {
    return jwt.sign({ uid, role } satisfies Omit<JwtPayload, 'iat' | 'exp'>, env.jwtSecret, { expiresIn });
}`,
    `export function signToken(uid: number, role: Role, expiresIn: string = '30d'): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = { uid, role };
    const options = { expiresIn } as jwt.SignOptions;
    return jwt.sign(payload, env.jwtSecret, options);
}`
);

fs.writeFileSync(p, s, 'utf8');
console.log('auth.ts：已修正类型扩展与 jwt 签名选项');
