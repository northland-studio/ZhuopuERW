import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

/* 1) admin.ts：crypto.randomInt 需要 node:crypto 的命名导入 */
{
    const p = path.join(root, 'src', 'routes', 'admin.ts');
    let s = fs.readFileSync(p, 'utf8');
    if (!s.includes("import crypto from 'node:crypto'")) {
        s = "import crypto from 'node:crypto';\n" + s;
    }
    fs.writeFileSync(p, s, 'utf8');
    console.log('admin.ts：已引入 node:crypto');
}

/* 2) 给 pdf-parse 的子路径补类型声明 */
{
    const p = path.join(root, 'src', 'types', 'pdf-parse.d.ts');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
        p,
        `declare module 'pdf-parse/lib/pdf-parse.js' {
    interface PdfParseResult {
        text: string;
        numpages?: number;
        info?: Record<string, unknown>;
    }
    function pdfParse(data: Buffer, options?: Record<string, unknown>): Promise<PdfParseResult>;
    export default pdfParse;
}
`,
        'utf8'
    );
    console.log('已补 pdf-parse 类型声明');
}
