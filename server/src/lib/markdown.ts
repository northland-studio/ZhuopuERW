/**
 * 清洗 MinerU / Markdown 转出来的文本
 *
 * MinerU 输出的是 Markdown：下划线、星号、方括号都会被反斜杠转义，
 * 真实试卷里的「    41    」可能被写成「\_\_41\_\_」甚至「\41\」，
 * 直接进库页面上就会出现 \41\ 这种脏字符。这里统一还原成纯文本。
 */
export function cleanMarkdown(text: string): string {
    let t = text;
    // 图片与链接语法：保留链接文字
    t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    // 还原 Markdown 转义字符：\_ \* \# \[ \] \( \) \. 等
    t = t.replace(/\\([\\`*_{}\[\]()#+\-.!|~>])/g, '$1');
    // 去掉残留的孤立反斜杠（\41\ 这类）
    t = t.replace(/\\(?=[\s\dA-Za-z]|$)/g, '');
    // 强调与标题标记
    t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
    t = t.replace(/(^|\n)#{1,6}\s*/g, '$1');
    // 表格分隔行、竖线
    t = t.replace(/^\s*\|?[\s:|-]{6,}\|?\s*$/gm, '');
    t = t.replace(/\s*\|\s*/g, '  ');
    // HTML 标签、零宽字符
    t = t.replace(/<[^>]+>/g, '');
    t = t.replace(/[\u200b-\u200f\ufeff]/g, '');
    // 空行收敛
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
}
