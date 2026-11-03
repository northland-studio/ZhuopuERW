import { useNavigate } from 'react-router-dom';
import { hasDesktop } from '../lib/desktop';
import '../styles/detail.css';

const VERSION = __APP_VERSION__;
const CDN = __CDN_BASE__;

const TAURI_ZIP = `${CDN}/v${VERSION}/Zhuopu-v${VERSION}-tauri-win-x64.zip`;
const ELECTRON_EXE = `${CDN}/v${VERSION}/Zhuopu-v${VERSION}-electron-win-x64-setup.exe`;

interface Pkg {
    name: string;
    tag: string;
    size: string;
    href: string;
    highlights: string[];
    note: string;
}

const PACKAGES: Pkg[] = [
    {
        name: '桌面客户端 · 便携版',
        tag: '免安装',
        size: '约 15 MB',
        href: TAURI_ZIP,
        highlights: ['解压即用，单个 exe', '自带 review 文件夹，可放 U 盘', '体积小，启动快'],
        note: '下载后解压到任意目录（不要只把 exe 拖出来），双击「zhuopu-desktop.exe」运行。'
    },
    {
        name: '桌面客户端 · 安装版',
        tag: '安装包',
        size: '约 79 MB',
        href: ELECTRON_EXE,
        highlights: ['双击安装，自动创建快捷方式', '内置 Chromium，兼容性最好', '适合长期在办公室电脑使用'],
        note: '下载后双击安装包，按提示完成安装；首次运行可能出现系统安全提示，选择「仍要运行」即可。'
    }
];

export default function Download() {
    const navigate = useNavigate();
    const desktop = hasDesktop();

    if (desktop) {
        return (
            <div className="page page-narrow" style={{ paddingTop: 72 }}>
                <div className="card card-pad" style={{ textAlign: 'center', padding: 44 }}>
                    <h1 style={{ fontSize: 20, marginBottom: 12 }}>请用浏览器打开网页版</h1>
                    <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.95 }}>
                        你已经在使用桌面客户端，不需要再下载一次。
                        如需给其他电脑安装，请在浏览器访问
                        <code className="mono" style={{ margin: '0 4px' }}>zhuopu.xuanjian.top/download</code>
                        。
                    </p>
                    <button className="btn btn-primary btn-sm" style={{ marginTop: 20 }} onClick={() => navigate('/')}>
                        回到首页
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="page" style={{ paddingTop: 40, maxWidth: 1080, margin: '0 auto' }}>
            <header style={{ marginBottom: 30 }}>
                <h1 style={{ fontSize: 30, letterSpacing: '-0.01em' }}>下载桌面客户端</h1>
                <p className="muted" style={{ marginTop: 10, fontSize: 14, lineHeight: 1.9 }}>
                    桌面客户端用于断网教室讲评：把讲评 JSON 放进 <code className="mono">review</code> 文件夹，
                    打开即看，不需要网络。全部版本 v{VERSION}，仅支持 Windows 10 及以上（64 位）。
                </p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
                {PACKAGES.map((p) => (
                    <section key={p.name} className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div className="spread">
                            <h2 style={{ fontSize: 17 }}>{p.name}</h2>
                            <span className="tag">{p.tag}</span>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 2, color: 'var(--ink-700)' }}>
                            {p.highlights.map((h) => (
                                <li key={h}>{h}</li>
                            ))}
                        </ul>
                        <div className="tiny muted">{p.size} · 版本 v{VERSION}</div>
                        <a className="btn btn-primary" href={p.href} style={{ textAlign: 'center', marginTop: 'auto' }}>
                            立即下载
                        </a>
                        <p className="tiny muted" style={{ lineHeight: 1.9, margin: 0 }}>{p.note}</p>
                    </section>
                ))}
            </div>

            <section className="card card-pad" style={{ marginTop: 26 }}>
                <h2 style={{ fontSize: 16, marginBottom: 12 }}>下载与使用说明</h2>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 2.1, color: 'var(--ink-700)' }}>
                    <li>下载后如提示「已阻止」，在文件属性里勾选「解除锁定」，或右键选择「仍要运行」。</li>
                    <li>便携版请解压整份压缩包再运行，<code className="mono">review</code> 文件夹要和 exe 放在同一层。</li>
                    <li>首次打开需要联网登录（邮箱验证码）；登录过一次后，讲评内容会缓存在本机。</li>
                    <li>离线讲评：在网页版或客户端里打开讲评，点「导出到本地」，文件会写进 <code className="mono">review</code> 文件夹；换到教室一体机后打开「本地讲评」即可。</li>
                    <li>如需批量迁移，直接把 <code className="mono">review</code> 文件夹整体拷贝到另一台电脑的同级目录即可。</li>
                </ol>
            </section>

            <p className="tiny muted" style={{ marginTop: 20, lineHeight: 1.9 }}>
                下载遇到问题，可先确认网络能访问 <code className="mono">cdn.zp.xuanjian.top</code>；
                仍然失败请在网页版「用户中心」反馈。
            </p>
        </div>
    );
}
