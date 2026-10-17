/**
 * 空位定位：完形填空 / 语法填空 / 七选五 的「第 N 空」在原文里的位置。
 *
 * 真实联调发现：让模型给「本题原文出处」时，它会把上一空的句子再抄一遍（#42 指到了 #41 的句子）。
 * 题号是确定的，所以这里用规则直接算：找到题号占位符，再取它所在的整句。
 */

export interface BlankSpan {
    start: number;
    end: number;
    text: string;
    /** 命中的占位符片段（如 "    41    " 或 "41 ____"） */
    marker: string;
}

/** 句子边界：英文句号/问号/感叹号 + 空白，或换行 */
function sentenceBounds(text: string, pos: number): { start: number; end: number } {
    const terminators = /[.!?。！？]/;
    let start = 0;
    for (let i = pos - 1; i >= 0; i--) {
        const ch = text[i]!;
        if (ch === '\n') { start = i + 1; break; }
        if (terminators.test(ch)) {
            // 句号后可能跟引号，再往前跳过空白
            let j = i + 1;
            while (j < pos && /["'”’)\s]/.test(text[j]!)) j++;
            start = j;
            break;
        }
    }
    while (start < pos && /\s/.test(text[start]!)) start++;

    let end = text.length;
    for (let i = pos; i < text.length; i++) {
        const ch = text[i]!;
        if (ch === '\n') { end = i; break; }
        if (terminators.test(ch)) {
            let j = i + 1;
            while (j < text.length && /["'”’)）]/.test(text[j]!)) j++;
            end = j;
            break;
        }
    }
    return { start, end };
}

/**
 * 找出题号对应的空位所在句
 * 兼容真实排版：`    41    `、`41.`、`__41__`、`(41)`、`41 ____`、`● 37`、`第41题`
 */
export function findBlankSentence(passage: string, numberLabel: string): BlankSpan | null {
    const n = String(numberLabel ?? '').trim();
    if (!n || !passage) return null;
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const patterns = [
        new RegExp(`(_{2,}\\s*${escaped}\\s*_{2,})`),                    // ___41___
        new RegExp(`([（(]\\s*${escaped}\\s*[)）])`),                      // (41)
        new RegExp(`(第\\s*${escaped}\\s*[题空])`),                        // 第41空
        new RegExp(`((?:^|[\\s\\u3000])${escaped}(?=[\\s\\u3000]|$))`),   // 单独一个 41（前后空白）
        new RegExp(`(\\b${escaped}\\s*[.、．])`)                          // 41.
    ];

    for (const re of patterns) {
        const m = re.exec(passage);
        if (!m || m.index === undefined) continue;
        const marker = m[1] ?? m[0];
        const hitPos = m.index;
        let bounds = sentenceBounds(passage, Math.max(0, hitPos));

        // 空位常常单独成行（如七选五的小标题「●  36」），单独一行太短，
        // 向后扩一到两行，保证高亮有上下文可读
        if (bounds.end - bounds.start < 24) {
            const expandedEnd = Math.min(passage.length, bounds.end + 200);
            let cut = expandedEnd;
            const nextBreak = passage.indexOf('\n', bounds.end + 1);
            if (nextBreak > 0 && nextBreak < expandedEnd) cut = nextBreak;
            bounds = { start: bounds.start, end: cut };
        }

        const raw = passage.slice(bounds.start, bounds.end);
        const text = raw.trim();
        if (text.length < 4) continue;
        const offset = raw.indexOf(text);
        return {
            start: bounds.start + Math.max(0, offset),
            end: bounds.start + Math.max(0, offset) + text.length,
            text,
            marker
        };
    }
    return null;
}

/** 给前端/保存用：返回偏移，失败则 null */
export function locateBlank(passage: string, numberLabel: string): { start: number; end: number } | null {
    const span = findBlankSentence(passage, numberLabel);
    return span ? { start: span.start, end: span.end } : null;
}
