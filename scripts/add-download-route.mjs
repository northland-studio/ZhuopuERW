import fs from 'node:fs';
import path from 'node:path';

const web = path.resolve(import.meta.dirname, '..', 'web', 'src');
let fail = 0;

function patch(rel, pairs) {
    const p = path.join(web, rel);
    let s = fs.readFileSync(p, 'utf8');
    for (const [from, to] of pairs) {
        if (!s.includes(from)) {
            console.log(`  ✗ 未匹配（${rel}）: ${from.slice(0, 60).replace(/\n/g, '\\n')}`);
            fail++;
            continue;
        }
        s = s.replace(from, to);
        console.log(`  ✓ ${rel}`);
    }
    fs.writeFileSync(p, s, 'utf8');
}

/* 路由 */
patch('App.tsx', [
    ["import LocalReviews from './pages/LocalReviews';", "import LocalReviews from './pages/LocalReviews';\nimport Download from './pages/Download';"],
    ['<Route path="/local" element={<LocalReviews />} />', '<Route path="/local" element={<LocalReviews />} />\n                            <Route path="/download" element={<Download />} />']
]);

/* 导航（网页端显示，桌面端隐藏） */
patch('components/Layout.tsx', [
    [
        `                        {hasDesktop() && (
                            <NavLink to="/local" className={({ isActive }) => \`nav-link \${isActive ? 'is-active' : ''}\`}>
                                本地讲评
                            </NavLink>
                        )}`,
        `                        {hasDesktop() && (
                            <NavLink to="/local" className={({ isActive }) => \`nav-link \${isActive ? 'is-active' : ''}\`}>
                                本地讲评
                            </NavLink>
                        )}
                        {!hasDesktop() && (
                            <NavLink to="/download" className={({ isActive }) => \`nav-link \${isActive ? 'is-active' : ''}\`}>
                                下载客户端
                            </NavLink>
                        )}`
    ],
    [
        `                    {hasDesktop() && (
                        <NavLink to="/local" className="nav-link" onClick={() => setSheetOpen(false)}>本地讲评</NavLink>
                    )}`,
        `                    {hasDesktop() && (
                        <NavLink to="/local" className="nav-link" onClick={() => setSheetOpen(false)}>本地讲评</NavLink>
                    )}
                    {!hasDesktop() && (
                        <NavLink to="/download" className="nav-link" onClick={() => setSheetOpen(false)}>下载客户端</NavLink>
                    )}`
    ]
]);

process.exit(fail ? 1 : 0);
