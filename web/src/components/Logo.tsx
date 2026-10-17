/**
 * 品牌标识：直接使用学校校徽 PNG（web/public/brand/logo.png）
 * 参考图仅作素材，不放仓库根目录，构建产物里只带这一份。
 */
export function LogoMark({
    size = 44,
    className,
    title = '琢璞英语讲评工作台'
}: {
    size?: number;
    /** 兼容旧调用：外框由 PNG 自带，这里忽略 */
    framed?: boolean;
    /** 兼容旧调用：亮色底用白色版本，PNG 是红金校徽，直接原样显示 */
    variant?: 'brand' | 'light';
    className?: string;
    title?: string;
}) {
    return (
        <img
            src="/brand/logo.png"
            width={size}
            height={size}
            alt={title}
            className={className}
            style={{
                display: 'block',
                borderRadius: Math.max(4, Math.round(size * 0.18)),
                background: '#fff',
                objectFit: 'contain'
            }}
            draggable={false}
        />
    );
}

/** 字标：左侧 logo + 右侧名称（导航栏与首屏收起后使用） */
export function LogoWordmark({ size = 34 }: { size?: number }) {
    return (
        <span className="brand-lockup">
            <LogoMark size={size} />
            <span className="brand-text">
                <span className="brand-name">琢璞英语讲评工作台</span>
                <span className="brand-en">Zhuopu English Review Workspace</span>
            </span>
        </span>
    );
}
