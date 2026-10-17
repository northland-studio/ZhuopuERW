/**
 * 改写 /api/reviews/:id/analyze：
 *   按篇一次调用（答案 + 长难句 + 词汇 一起返回），不再逐题调用 + 单独汇总。
 * 同时把旧的两个 import 换成新的批量实现。
 */
import fs from 'node:fs';
import path from 'node:path';

const p = path.resolve(import.meta.dirname, '..', 'src', 'routes', 'reviews.ts');
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('analyzePassageBatch')) {
    s = s.replace(
        "import { analyzeQuestion, splitWorksheet, summarizePassage } from '../services/analysis.js';",
        "import { analyzeQuestion, splitWorksheet } from '../services/analysis.js';\nimport { analyzePassageBatch } from '../services/llm/batch.js';"
    );
}

const startMarker = '        const results: { questionId: number; ok: boolean; error?: string }[] = [];';
const endMarker = '        const done = results.filter((r) => r.ok).length;';
const start = s.indexOf(startMarker);
const end = s.indexOf(endMarker);

if (start < 0 || end < 0) {
    console.log('未找到旧的逐题分析代码块，跳过');
    process.exit(0);
}

const replacement = `        const results: { questionId: number; ok: boolean; error?: string }[] = [];
        let tokens = 0;
        let modelUsed = '';

        // 按篇分组：每篇一次调用，答案/长难句/词汇一次拿全
        const byPassage = new Map<number | null, typeof freshQ>();
        type Q = (typeof review.questions)[number];
        function freshQ() { return [] as Q[]; }

        for (const qid of targetIds) {
            const q = review.questions.find((x) => x.id === qid);
            if (!q) { results.push({ questionId: qid, ok: false, error: '题目不存在' }); continue; }
            const key = q.passageId ?? review.passages[0]?.id ?? null;
            if (!byPassage.has(key)) byPassage.set(key, []);
            byPassage.get(key)!.push(q);
        }

        for (const [passageId, qs] of byPassage.entries()) {
            const passage = review.passages.find((x) => x.id === passageId) ?? review.passages[0];
            if (!passage || !qs.length) continue;
            try {
                const batch = await analyzePassageBatch(
                    {
                        type: qs[0]!.type,
                        passage: passage.content,
                        passageLabel: passage.label,
                        questions: qs.map((q) => ({
                            numberLabel: q.numberLabel,
                            stem: q.stem,
                            options: q.options,
                            answer: q.answer
                        }))
                    },
                    { userId: req.user!.id }
                );

                for (const item of batch.questions) {
                    const target = qs.find((q) => String(q.numberLabel).trim() === String(item.numberLabel).trim());
                    if (!target) continue;
                    saveQuestionAnalysis(target.id, item.analysis, batch.model, item.source);
                    results.push({ questionId: target.id, ok: true });
                }
                // 未返回的题目记失败
                for (const q of qs) {
                    if (!results.some((r) => r.questionId === q.id)) {
                        results.push({ questionId: q.id, ok: false, error: '模型未返回该题' });
                    }
                }

                // 这篇的汇总（长难句与词汇）随首次分析一起落库
                if (passage.id != null) {
                    savePassageMeta(passage.id, {
                        summary: batch.passage.summary,
                        vocabulary: batch.passage.vocabulary,
                        longSentences: batch.passage.longSentences
                    });
                }
                tokens += batch.usage.total;
                modelUsed = batch.model;
            } catch (e) {
                logger.warn(\`原文 #\${passage.id} 批量讲评失败：\${(e as Error).message}\`);
                for (const q of qs) results.push({ questionId: q.id, ok: false, error: (e as Error).message });
            }
        }

        // 汇总整份讲评的词汇表与长难句（取各篇的并集）
        const after = getReview(req.user!.id, review.id)!;
        const metaOf = (passageId: number | null) =>
            (after.passages.find((x) => x.id === passageId) as { meta?: { vocabulary?: unknown[]; longSentences?: unknown[]; summary?: string } } | undefined)?.meta ?? {};
        const allVocab: unknown[] = [];
        const allLong: unknown[] = [];
        const summaries: string[] = [];
        for (const ps of after.passages) {
            const m = metaOf(ps.id);
            if (Array.isArray(m.vocabulary)) allVocab.push(...m.vocabulary);
            if (Array.isArray(m.longSentences)) allLong.push(...m.longSentences);
            if (m.summary) summaries.push(m.summary);
        }
        if (allVocab.length || allLong.length || summaries.length) {
            saveReviewSummary(review.id, {
                summary: summaries.join('\\n'),
                vocab: allVocab,
                longSentences: allLong
            });
        }

`;

s = s.slice(0, start) + replacement + s.slice(end);

// 后面旧的「整篇汇总」循环删掉（已并入批量调用）
const oldSummaryStart = s.indexOf('        // 整篇汇总：本次涉及的原文各做一次（词汇表 / 长难句 / 概要）');
const oldSummaryEnd = s.indexOf('        const done = results.filter((r) => r.ok).length;');
if (oldSummaryStart >= 0 && oldSummaryEnd > oldSummaryStart) {
    s = s.slice(0, oldSummaryStart) + s.slice(oldSummaryEnd);
}

// done 之后用到的 model 变量改为 modelUsed
s = s.replace('            model: modelUsed.model,', '            model: modelUsed,');

fs.writeFileSync(p, s, 'utf8');
console.log('reviews.ts：analyze 已改为按篇一次调用');
