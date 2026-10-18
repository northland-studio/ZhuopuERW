import fs from 'node:fs';
import path from 'node:path';

const web = path.resolve(import.meta.dirname, '..', 'web');
const log = (m) => console.log(m);
let fail = 0;

function patch(file, pairs) {
    const p = path.join(web, file);
    let s = fs.readFileSync(p, 'utf8');
    for (const [from, to] of pairs) {
        if (!s.includes(from)) { console.log(`  ✗ 未匹配（${file}）: ${from.slice(0, 50)}`); fail++; continue; }
        s = s.replace(from, to);
        console.log(`  ✓ ${file}`);
    }
    fs.writeFileSync(p, s, 'utf8');
}

/* ---------- App.tsx：注册 /local 路由 ---------- */
patch('src/App.tsx', [
    ["import Forgot from './pages/Forgot';", "import Forgot from './pages/Forgot';\nimport LocalReviews from './pages/LocalReviews';"],
    ['<Route path="/forgot" element={<Forgot />} />', '<Route path="/forgot" element={<Forgot />} />\n                            <Route path="/local" element={<LocalReviews />} />']
]);

/* ---------- Layout.tsx：导航加入「本地讲评」（仅桌面端） ---------- */
patch('src/components/Layout.tsx', [
    [
        `                        <NavLink to="/reviews" className={({ isActive }) => \`nav-link \${isActive ? 'is-active' : ''}\`}>
                            我的讲评
                        </NavLink>`,
        `                        <NavLink to="/reviews" className={({ isActive }) => \`nav-link \${isActive ? 'is-active' : ''}\`}>
                            我的讲评
                        </NavLink>
                        {hasDesktop() && (
                            <NavLink to="/local" className={({ isActive }) => \`nav-link \${isActive ? 'is-active' : ''}\`}>
                                本地讲评
                            </NavLink>
                        )}`
    ],
    [
        `                    <NavLink to="/reviews" className="nav-link" onClick={() => setSheetOpen(false)}>我的讲评</NavLink>`,
        `                    <NavLink to="/reviews" className="nav-link" onClick={() => setSheetOpen(false)}>我的讲评</NavLink>
                    {hasDesktop() && (
                        <NavLink to="/local" className="nav-link" onClick={() => setSheetOpen(false)}>本地讲评</NavLink>
                    )}`
    ]
]);

/* ---------- ReviewDetail.tsx：加「导出到本地」 ---------- */
patch('src/pages/ReviewDetail.tsx', [
    [
        "import { useToast } from '../lib/toast';",
        "import { useToast } from '../lib/toast';\nimport { desktop, hasDesktop } from '../lib/desktop';"
    ],
    [
        `    const share = async () => {`,
        `    /** 把当前讲评写入程序目录的 review/（桌面端离线讲评用） */
    const exportToLocal = async () => {
        const bridge = desktop();
        if (!bridge) { push('仅桌面客户端支持导出到本地', 'bad'); return; }
        try {
            const res = await api<Response>(\`/api/reviews/\${review.id}/export\`, { raw: true });
            const text = await res.text();
            const saved = await bridge.review.write(review.title, text);
            push(\`已写入本地：\${saved}\`, 'ok');
        } catch (e) {
            push('导出到本地失败：' + (e as Error).message, 'bad');
        }
    };

    const share = async () => {`
    ],
    [
        `                    <button className="btn btn-sm btn-ghost" onClick={() => void download(\`/api/reviews/\${review.id}/export\`, \`\${review.title}.json\`)}>
                        导出 JSON
                    </button>`,
        `                    <button className="btn btn-sm btn-ghost" onClick={() => void download(\`/api/reviews/\${review.id}/export\`, \`\${review.title}.json\`)}>
                        导出 JSON
                    </button>
                    {hasDesktop() && (
                        <button className="btn btn-sm btn-ghost" onClick={exportToLocal}>
                            导出到本地
                        </button>
                    )}`
    ]
]);

process.exit(fail ? 1 : 0);
