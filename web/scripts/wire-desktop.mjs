import fs from 'node:fs';
import path from 'node:path';

/* 把桌面端顶部操作栏挂进 Layout，并在桌面环境下给 body 打标记 */
const root = path.resolve(import.meta.dirname, '..');
const layout = path.join(root, 'src', 'components', 'Layout.tsx');
const app = path.join(root, 'src', 'App.tsx');

{
    let s = fs.readFileSync(layout, 'utf8');
    if (!s.includes('DesktopTitleBar')) {
        s = s.replace(
            "import { useAuth } from '../lib/auth';",
            "import { useAuth } from '../lib/auth';\nimport { DesktopTitleBar } from './DesktopTitleBar';\nimport { hasDesktop, desktop } from '../lib/desktop';"
        );
        s = s.replace(
            '    return (\n        <>\n            <header className="nav">',
            `    return (
        <>
            <DesktopTitleBar />
            <header className="nav">`
        );
        // 桌面标记：给 CSS 留出顶部操作栏高度
        s = s.replace(
            '    const initial = (user?.username || user?.email || \'Z\').slice(0, 1).toUpperCase();',
            `    const initial = (user?.username || user?.email || 'Z').slice(0, 1).toUpperCase();

    useEffect(() => {
        if (!hasDesktop()) return;
        document.body.classList.add('is-desktop');
        const platform = desktop()?.platform || '';
        if (platform === 'darwin') document.body.classList.add('is-mac');
    }, []);`
        );
        fs.writeFileSync(layout, s, 'utf8');
        console.log('Layout：已挂载 DesktopTitleBar 与桌面标记');
    } else {
        console.log('Layout：已挂载过');
    }
}

/* index.html 里加一条：桌面端禁用原生右键（浏览器端保留默认） */
{
    const webIndex = path.join(root, 'index.html');
    let h = fs.readFileSync(webIndex, 'utf8');
    if (!h.includes('zhuopu-desktop-guard')) {
        h = h.replace('</head>', `    <script id="zhuopu-desktop-guard">
        // 桌面客户端里禁用右键菜单与开发者工具快捷键（浏览器端不生效）
        if (window.zhuopuDesktop) {
            document.addEventListener('contextmenu', (e) => e.preventDefault());
            document.addEventListener('keydown', (e) => {
                const k = (e.key || '').toLowerCase();
                if (k === 'f12' || (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (e.ctrlKey && k === 'u')) {
                    e.preventDefault();
                }
            });
        }
    </script>
</head>`);
        fs.writeFileSync(webIndex, h, 'utf8');
        console.log('index.html：已加桌面端右键/快捷键屏蔽');
    } else {
        console.log('index.html：已存在桌面守卫');
    }
}
