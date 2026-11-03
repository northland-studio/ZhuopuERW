/**
 * 原文对照栏：位于导航栏与「原文 / 题目」两栏之间，只展示当前选中题目的原文对应句。
 * 不做跳转交互（按需求只做展示）。
 */
export function CompareBar({
    hasQuestion,
    numberLabel,
    typeLabel,
    sentence
}: {
    hasQuestion: boolean;
    numberLabel?: string;
    typeLabel?: string;
    sentence: string;
}) {
    return (
        <section className="rd-cmp" aria-label="原文对照">
            <div className="rd-cmp-label">
                {hasQuestion ? (
                    <>
                        <span className="tag tag-brand">第 {numberLabel || '?'} 题</span>
                        {typeLabel && <span className="tag">{typeLabel}</span>}
                    </>
                ) : (
                    <span className="tag">原文对照</span>
                )}
            </div>
            {hasQuestion ? (
                sentence ? (
                    <p className="rd-cmp-text">{sentence}</p>
                ) : (
                    <p className="rd-cmp-empty">这道题没有记录原文出处，可在左侧手动对照。</p>
                )
            ) : (
                <p className="rd-cmp-empty">点击右侧题目，这里会显示该题在原文中的对应句。</p>
            )}
        </section>
    );
}
