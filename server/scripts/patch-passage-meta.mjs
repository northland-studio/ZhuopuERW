/** 把每篇原文的长难句/词汇/概要写进 passages.meta，供底部汇总栏按篇展示 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

/* 1) services/reviews.ts 增加 savePassageMeta */
{
    const p = path.join(root, 'src', 'services', 'reviews.ts');
    let s = fs.readFileSync(p, 'utf8');
    if (!s.includes('export function savePassageMeta')) {
        const anchor = '/** 写入讲评级汇总（词汇表 / 长难句 / 概要） */';
        const fn = `/** 写入单篇原文的汇总（供讲评页底部的长难句栏使用） */
export function savePassageMeta(
    passageId: number,
    data: { summary?: string; vocabulary?: unknown[]; longSentences?: unknown[] }
): void {
    const row = get<{ meta: string }>('SELECT meta FROM passages WHERE id = ?', passageId);
    const current = parseJson<Record<string, unknown>>(row?.meta, {});
    const next = { ...current, ...data };
    run('UPDATE passages SET meta = ? WHERE id = ?', JSON.stringify(next), passageId);
}

`;
        s = s.replace(anchor, fn + anchor);
        fs.writeFileSync(p, s, 'utf8');
        console.log('reviews.ts：已添加 savePassageMeta');
    } else {
        console.log('reviews.ts：已存在 savePassageMeta');
    }
}

/* 2) routes/reviews.ts 在汇总时写入 passages.meta */
{
    const p = path.join(root, 'src', 'routes', 'reviews.ts');
    let s = fs.readFileSync(p, 'utf8');

    if (!s.includes('savePassageMeta')) {
        s = s.replace(
            '    saveReviewSummary,',
            '    saveReviewSummary,\n    savePassageMeta,'
        );
    }

    const old = `                const s = await summarizePassage(p.content, p.label, index + 1, { userId: req.user!.id });
                summaryParts.push({ passageIndex: index + 1, summary: s.analysis.summary });
                vocab.push(...s.analysis.vocabulary);
                longSentences.push(...s.analysis.longSentences);
                tokens += s.usage.total;`;

    const next = `                const s = await summarizePassage(p.content, p.label, index + 1, { userId: req.user!.id });
                summaryParts.push({ passageIndex: index + 1, summary: s.analysis.summary });
                vocab.push(...s.analysis.vocabulary);
                longSentences.push(...s.analysis.longSentences);
                tokens += s.usage.total;
                // 按篇存一份，底部「长难句翻译」栏按原文分组展示
                if (p.id != null) {
                    savePassageMeta(p.id, {
                        summary: s.analysis.summary,
                        longSentences: s.analysis.longSentences,
                        vocabulary: s.analysis.vocabulary
                    });
                }`;

    if (s.includes(old)) {
        s = s.replace(old, next);
        console.log('routes/reviews.ts：汇总时写入 passages.meta');
    } else {
        console.log('routes/reviews.ts：未找到汇总代码块，跳过');
    }
    fs.writeFileSync(p, s, 'utf8');
}
