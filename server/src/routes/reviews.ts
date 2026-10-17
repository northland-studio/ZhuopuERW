import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { all, get, now } from '../db/index.js';
import { logger } from '../logger.js';
import { analyzeQuestion, splitWorksheet } from '../services/analysis.js';
import { analyzePassageBatch } from '../services/llm/batch.js';
import {
    appendQuestions,
    createReview,
    createShare,
    defaultTitle,
    deleteQuestion,
    ExportFile,
    exportReview,
    getReview,
    importReview,
    listReviews,
    renameReview,
    replacePassages,
    saveQuestionAnalysis,
    saveReviewSummary,
    savePassageMeta,
    softDeleteReview,
    updateQuestion
} from '../services/reviews.js';
import { QUESTION_TYPES, type QuestionType } from '../contracts.js';

export const reviewsRouter = Router();
reviewsRouter.use(requireAuth);

const typeEnum = z.enum(QUESTION_TYPES);
const optionsSchema = z.array(z.object({ label: z.string().default(''), text: z.string().default('') })).default([]);

/* ---------------- 列表 / 新建 ---------------- */

reviewsRouter.get('/', (req, res) => {
    const kind = z.enum(['review', 'single']).optional().safeParse(req.query.kind);
    res.json({ reviews: listReviews(req.user!.id, kind.success ? kind.data : undefined) });
});

reviewsRouter.post('/', (req, res) => {
    const parsed = z
        .object({
            title: z.string().trim().max(80).optional(),
            kind: z.enum(['review', 'single']).default('review')
        })
        .safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: '参数不正确' });
    const review = createReview(req.user!.id, { title: parsed.data.title, kind: parsed.data.kind });
    res.status(201).json({ review });
});

/* ---------------- 单个讲评 ---------------- */

function ownedReview(userId: number, idRaw: string) {
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) return null;
    return getReview(userId, id);
}

reviewsRouter.get('/:id', (req, res) => {
    const review = ownedReview(req.user!.id, req.params.id!);
    if (!review) return res.status(404).json({ error: '讲评不存在' });
    res.json({ review });
});

reviewsRouter.patch('/:id', (req, res) => {
    const parsed = z.object({ title: z.string().trim().min(1).max(80) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '标题不能为空且不超过 80 字' });
    const ok = renameReview(req.user!.id, Number(req.params.id), parsed.data.title);
    if (!ok) return res.status(404).json({ error: '讲评不存在' });
    res.json({ ok: true });
});

reviewsRouter.delete('/:id', (req, res) => {
    const ok = softDeleteReview(req.user!.id, Number(req.params.id));
    if (!ok) return res.status(404).json({ error: '讲评不存在' });
    res.json({ ok: true });
});

/* ---------------- 原文 ---------------- */

reviewsRouter.put('/:id/passages', (req, res) => {
    const parsed = z
        .object({ passages: z.array(z.object({ label: z.string().max(40).optional(), content: z.string().min(1) })).min(1) })
        .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '至少需要一篇原文' });
    const review = ownedReview(req.user!.id, req.params.id!);
    if (!review) return res.status(404).json({ error: '讲评不存在' });
    const ids = replacePassages(review.id, parsed.data.passages);
    res.json({ ok: true, passageIds: ids });
});

/* ---------------- 题目 ---------------- */

reviewsRouter.post('/:id/questions', (req, res) => {
    const parsed = z
        .object({
            questions: z
                .array(
                    z.object({
                        passageIndex: z.number().int().min(1).optional(),
                        type: typeEnum,
                        numberLabel: z.string().max(20).optional(),
                        stem: z.string().max(4000).optional(),
                        options: optionsSchema,
                        answer: z.string().max(200).optional(),
                        sourceQuote: z.string().max(2000).optional()
                    })
                )
                .min(1)
        })
        .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '题目数据不完整' });

    const review = ownedReview(req.user!.id, req.params.id!);
    if (!review) return res.status(404).json({ error: '讲评不存在' });

    const ids = appendQuestions(
        review.id,
        parsed.data.questions.map((q) => ({
            type: q.type,
            numberLabel: q.numberLabel,
            stem: q.stem,
            options: q.options,
            answer: q.answer,
            sourceQuote: q.sourceQuote,
            passageId: q.passageIndex ? review.passages[q.passageIndex - 1]?.id ?? null : review.passages[0]?.id ?? null,
            passageContent: q.passageIndex ? review.passages[q.passageIndex - 1]?.content : review.passages[0]?.content
        }))
    );
    res.status(201).json({ ok: true, questionIds: ids });
});

reviewsRouter.patch('/:id/questions/:qid', (req, res) => {
    const parsed = z
        .object({
            numberLabel: z.string().max(20).optional(),
            stem: z.string().max(4000).optional(),
            options: optionsSchema.optional(),
            answer: z.string().max(200).optional(),
            type: typeEnum.optional(),
            sourceStart: z.number().int().min(0).nullable().optional(),
            sourceEnd: z.number().int().min(0).nullable().optional(),
            passageId: z.number().int().nullable().optional()
        })
        .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '参数不正确' });
    const ok = updateQuestion(req.user!.id, Number(req.params.id), Number(req.params.qid), parsed.data);
    if (!ok) return res.status(404).json({ error: '题目不存在' });
    res.json({ ok: true });
});

reviewsRouter.delete('/:id/questions/:qid', (req, res) => {
    const ok = deleteQuestion(req.user!.id, Number(req.params.id), Number(req.params.qid));
    if (!ok) return res.status(404).json({ error: '题目不存在' });
    res.json({ ok: true });
});

/* ---------------- AI：切分（返回草稿，等老师校正后再生效） ---------------- */

reviewsRouter.post('/:id/split', async (req, res, next) => {
    try {
        const parsed = z
            .object({
                text: z.string().min(10).max(120000),
                type: typeEnum.optional(),
                extra: z.string().max(500).optional()
            })
            .safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: '请先提供试卷内容（至少 10 个字符）' });

        const review = ownedReview(req.user!.id, req.params.id!);
        if (!review) return res.status(404).json({ error: '讲评不存在' });

        const { result, usage, model } = await splitWorksheet(parsed.data.text, {
            type: parsed.data.type,
            extra: parsed.data.extra,
            userId: req.user!.id
        });
        res.json({ draft: result, model, usage });
    } catch (e) {
        next(e);
    }
});

/** 把校正后的切分结果落库（可选追加或替换） */
reviewsRouter.post('/:id/apply', (req, res) => {
    const parsed = z
        .object({
            passages: z.array(z.object({ label: z.string().max(40).optional(), content: z.string().min(1) })).min(1),
            questions: z
                .array(
                    z.object({
                        passageIndex: z.number().int().min(1).default(1),
                        type: typeEnum,
                        numberLabel: z.string().max(20).default(''),
                        stem: z.string().max(4000).default(''),
                        options: optionsSchema,
                        answer: z.string().max(200).default(''),
                        sourceQuote: z.string().max(2000).default('')
                    })
                )
                .default([]),
            mode: z.enum(['replace', 'append']).default('replace'),
            title: z.string().trim().max(80).optional()
        })
        .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '数据不完整' });

    const review = ownedReview(req.user!.id, req.params.id!);
    if (!review) return res.status(404).json({ error: '讲评不存在' });

    const { passages, questions, mode } = parsed.data;
    const passageIds = mode === 'replace' ? replacePassages(review.id, passages) : [...review.passages.map((p) => p.id)];
    if (mode === 'append') return res.status(400).json({ error: '当前版本仅支持覆盖写入' });

    const ids = appendQuestions(
        review.id,
        questions.map((q) => ({
            type: q.type,
            numberLabel: q.numberLabel,
            stem: q.stem,
            options: q.options,
            answer: q.answer,
            sourceQuote: q.sourceQuote,
            passageId: passageIds[q.passageIndex - 1] ?? passageIds[0] ?? null,
            passageContent: passages[q.passageIndex - 1]?.content ?? passages[0]?.content
        }))
    );
    if (parsed.data.title) renameReview(req.user!.id, review.id, parsed.data.title);
    const updated = getReview(req.user!.id, review.id);
    res.json({ ok: true, questionIds: ids, review: updated });
});

/* ---------------- AI：逐题讲评 + 整篇汇总 ---------------- */

reviewsRouter.post('/:id/analyze', async (req, res, next) => {
    try {
        const parsed = z
            .object({
                questionIds: z.array(z.number().int().positive()).optional(),
                limit: z.number().int().min(1).max(20).default(8),
                refresh: z.boolean().default(false)
            })
            .safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ error: '参数不正确' });

        const review = ownedReview(req.user!.id, req.params.id!);
        if (!review) return res.status(404).json({ error: '讲评不存在' });
        if (!review.questions.length) return res.status(400).json({ error: '这张讲评还没有题目，请先导入题目' });

        const targetIds = parsed.data.questionIds?.length
            ? parsed.data.questionIds
            : review.questions
                  .filter((q) => parsed.data.refresh || !q.analyzedAt)
                  .slice(0, parsed.data.limit)
                  .map((q) => q.id);

        if (!targetIds.length) {
            return res.json({ ok: true, analyzed: 0, message: '所有题目都已讲评过（可传 refresh=true 重新生成）' });
        }

        const results: { questionId: number; ok: boolean; error?: string }[] = [];
        let tokens = 0;
        let modelUsed = '';

        // 按篇分组：每篇一次调用，答案/长难句/词汇一次拿全
        type Q = (typeof review.questions)[number];
        const byPassage = new Map<number | null, Q[]>();

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
                logger.warn(`原文 #${passage.id} 批量讲评失败：${(e as Error).message}`);
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
                summary: summaries.join('\n'),
                vocab: allVocab,
                longSentences: allLong
            });
        }

        const done = results.filter((r) => r.ok).length;
        res.json({
            ok: true,
            analyzed: done,
            failed: results.filter((r) => !r.ok),
            tokens,
            model: modelUsed,
            review: getReview(req.user!.id, review.id)
        });
    } catch (e) {
        next(e);
    }
});

/* ---------------- 导出 / 导入 / 分享 ---------------- */

reviewsRouter.get('/:id/export', (req, res) => {
    const file = exportReview(req.user!.id, Number(req.params.id));
    if (!file) return res.status(404).json({ error: '讲评不存在' });
    const filename = `${file.title.replace(/[\\/:*?"<>|]/g, '_')}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(JSON.stringify(file, null, 2));
});

reviewsRouter.post('/import', (req, res) => {
    const parsed = z
        .object({
            file: z.object({
                format: z.literal('zhuopu-review'),
                version: z.number().int().min(1),
                title: z.string().max(120).default(defaultTitle()),
                kind: z.enum(['review', 'single']).default('review'),
                summary: z.string().default(''),
                vocab: z.array(z.any()).default([]),
                longSentences: z.array(z.any()).default([]),
                passages: z.array(z.object({ label: z.string().default(''), content: z.string() })).default([]),
                questions: z
                    .array(
                        z.object({
                            type: typeEnum,
                            numberLabel: z.string().default(''),
                            stem: z.string().default(''),
                            options: optionsSchema,
                            answer: z.string().default(''),
                            sourceStart: z.number().nullable().default(null),
                            sourceEnd: z.number().nullable().default(null),
                            passageIndex: z.number().nullable().default(null),
                            analysis: z.any().default({})
                        })
                    )
                    .default([])
            }),
            title: z.string().trim().max(80).optional()
        })
        .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '导入文件格式不正确（需要琢璞讲评 JSON）' });

    const id = importReview(req.user!.id, parsed.data.file as unknown as ExportFile, { title: parsed.data.title });
    res.status(201).json({ ok: true, id, review: getReview(req.user!.id, id) });
});

reviewsRouter.post('/:id/share', (req, res) => {
    const review = ownedReview(req.user!.id, req.params.id!);
    if (!review) return res.status(404).json({ error: '讲评不存在' });
    const { token } = createShare(req.user!.id, review.id);
    res.status(201).json({ ok: true, token, url: `${process.env.SITE_URL || ''}/share/${token}` });
});

/* ---------------- 单题临时讲评：一次请求完成「建 → 切 → 讲」 ---------------- */

reviewsRouter.post('/quick', async (req, res, next) => {
    try {
        const parsed = z
            .object({
                text: z.string().min(10).max(20000),
                type: typeEnum.default('reading'),
                numberLabel: z.string().max(20).default('1'),
                stem: z.string().max(2000).default(''),
                options: optionsSchema,
                passage: z.string().max(20000).default('')
            })
            .safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: '请提供题目内容' });

        const { analysis, usage, model } = await analyzeQuestion(
            {
                type: parsed.data.type,
                numberLabel: parsed.data.numberLabel,
                stem: parsed.data.stem || parsed.data.text,
                options: parsed.data.options,
                passage: parsed.data.passage || parsed.data.text
            },
            { userId: req.user!.id }
        );
        res.json({ analysis, model, usage });
    } catch (e) {
        next(e);
    }
});

/** 统计：讲评数、题目数、已讲评数 */
reviewsRouter.get('/stats/overview', (req, res) => {
    const uid = req.user!.id;
    const sets = get<{ c: number }>('SELECT COUNT(*) AS c FROM review_sets WHERE user_id = ? AND deleted_at IS NULL', uid)?.c ?? 0;
    const questions = get<{ c: number }>(
        'SELECT COUNT(*) AS c FROM questions q JOIN review_sets r ON r.id = q.review_set_id WHERE r.user_id = ? AND r.deleted_at IS NULL', uid
    )?.c ?? 0;
    const analyzed = get<{ c: number }>(
        'SELECT COUNT(*) AS c FROM questions q JOIN review_sets r ON r.id = q.review_set_id WHERE r.user_id = ? AND r.deleted_at IS NULL AND q.analyzed_at IS NOT NULL', uid
    )?.c ?? 0;
    const tokens = get<{ s: number }>('SELECT COALESCE(SUM(total_tokens),0) AS s FROM llm_usage WHERE user_id = ?', uid)?.s ?? 0;
    res.json({ sets, questions, analyzed, tokens });
});

export const shareRouter = Router();

/** 分享链接：公开只读，可被其他老师导入 */
shareRouter.get('/:token', (req, res) => {
    const { resolveShare, exportReview } = requireShares();
    const found = resolveShare(req.params.token!);
    if (!found) return res.status(404).json({ error: '分享链接不存在或已失效' });
    if (found.expired) return res.status(410).json({ error: '分享链接已过期' });
    const file = exportReview(found.ownerId, found.reviewId);
    if (!file) return res.status(404).json({ error: '讲评已被删除' });
    res.json({ shared: true, file });
});

function requireShares() {
    // 延迟引用，避免循环依赖时拿到 undefined
    return {
        resolveShare: (t: string) => sharesApi.resolveShare(t),
        exportReview: (uid: number, id: number) => sharesApi.exportReview(uid, id)
    };
}

import * as sharesApi from '../services/reviews.js';
