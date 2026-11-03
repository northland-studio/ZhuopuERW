/**
 * 原文对照句提取
 *
 * 优先级：
 *   1. 题目记录下来的 offset（sourceStart / sourceEnd）
 *   2. analysis.sourceQuote 在原文中的位置
 *   3. 按题号（空位题常见 41 / __41__ / 第41空）在原文中定位
 * 找到位置后扩展到完整句子，供「原文对照」栏展示。
 */

export interface SentenceSource {
    numberLabel?: string;
    sourceStart?: number | null;
    sourceEnd?: number | null;
    analysis?: { sourceQuote?: string } | null;
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isBoundary(ch: string | undefined): boolean {
    return ch === '.' || ch === '!' || ch === '?' || ch === '\n' || ch === ';';
}

/** 从任意区间扩展到所在整句（最多 600 字符） */
export function expandToSentence(content: string, start: number, end: number): string {
    if (!content) return '';
    let a = Math.max(0, Math.min(start, content.length));
    while (a > 0 && !isBoundary(content[a - 1])) a--;

    let b = Math.max(a, Math.min(end, content.length));
    while (b < content.length && !isBoundary(content[b])) b++;
    if (b < content.length) b++;

    const slice = content.slice(a, b).trim();
    if (slice.length > 600) return content.slice(Math.max(0, start), Math.min(content.length, end)).trim();
    return slice;
}

export function compareSentence(content: string, q: SentenceSource | null | undefined): string {
    if (!content || !q) return '';

    let start: number | null = typeof q.sourceStart === 'number' ? q.sourceStart : null;
    let end: number | null = typeof q.sourceEnd === 'number' ? q.sourceEnd : null;

    if (start == null) {
        const quote = q.analysis?.sourceQuote;
        if (quote) {
            const i = content.indexOf(quote);
            if (i >= 0) {
                start = i;
                end = i + quote.length;
            }
        }
    }

    if (start == null) {
        const label = (q.numberLabel ?? '').trim();
        if (label) {
            const re = new RegExp(`(?:^|[\\s\\u3000])${escapeRe(label)}(?=[\\s\\u3000]|$)`);
            const m = re.exec(content);
            if (m) {
                start = m.index;
                end = m.index + m[0].length;
            }
        }
    }

    if (start == null) return '';
    return expandToSentence(content, start, end ?? start);
}
