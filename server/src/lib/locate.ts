/**
 * 出处定位：把模型给的「原文片段」在原文里精确定位，算出字符偏移，
 * 供讲评页左侧高亮。模型常会改写标点、加 "___"、合并空格，所以做多级匹配：
 *   1) 原文精确匹配
 *   2) 去掉多余空白后匹配
 *   3) 去掉标点、下划线、引号后的归一化匹配（仍返回原串偏移）
 *   4) 取首尾各 24 个字符做锚点匹配
 * 都失败返回 null（前端就不高亮，不阻塞讲评）。
 */
export interface Located {
    start: number;
    end: number;
    text: string;
    exact: boolean;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const aggressive = (s: string) => s.replace(/[\s_—–\-"'“”‘’.,;:!?()（）\[\]]+/g, '').toLowerCase();

export function locateQuote(passage: string, quote: string): Located | null {
    const q = (quote ?? '').trim();
    if (!q || !passage) return null;

    // 1) 精确
    let idx = passage.indexOf(q);
    if (idx >= 0) return { start: idx, end: idx + q.length, text: passage.slice(idx, idx + q.length), exact: true };

    // 2) 空白归一化：在归一化后的原文上找，再映射回原偏移
    const normalizedPassage = norm(passage);
    const nq = norm(q);
    const nIdx = normalizedPassage.indexOf(nq);
    if (nIdx >= 0) {
        // 归一化串的每个字符对应原文一个区间，逐字符建立映射
        const map: number[] = [];
        let pi = 0;
        for (const ch of normalizedPassage) {
            while (pi < passage.length && /\s/.test(passage[pi]!) && passage[pi] !== ch) pi++;
            map.push(pi);
            pi++;
        }
    const start = map[nIdx] ?? 0;
        const endChar = map[nIdx + nq.length - 1];
        const end = endChar === undefined ? passage.length : endChar + 1;
        const text = passage.slice(start, end);
        if (aggressive(text).includes(aggressive(nq).slice(0, Math.min(20, aggressive(nq).length)))) {
            return { start, end, text, exact: false };
        }
    }

    // 3) 激进归一化：定位首尾片段
    const apPassage = aggressive(passage);
    const aq = aggressive(q);
    if (aq.length >= 8) {
        const head = aq.slice(0, 24);
        const pos = apPassage.indexOf(head);
        if (pos >= 0) {
            // 用原文里同样长度的窗口估算结束位置
            const approxStart = Math.min(passage.length - 1, Math.round((pos / Math.max(1, apPassage.length)) * passage.length));
            const approxEnd = Math.min(passage.length, approxStart + q.length);
            return { start: approxStart, end: approxEnd, text: passage.slice(approxStart, approxEnd), exact: false };
        }
    }
    return null;
}
