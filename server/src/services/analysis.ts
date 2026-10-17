import { z } from 'zod';
import {
    passageAnalysisSchema,
    questionAnalysisSchema,
    reviewAnalysisSchema,
    splitResultSchema,
    type QuestionAnalysis,
    type ReviewAnalysis,
    type SplitResult,
    type QuestionType
} from '../contracts.js';
import { chatJson, type Provider } from './llm/index.js';
import { buildPassageSummaryPrompt, buildQuestionPrompt, buildSplitPrompt } from './llm/prompts.js';
import { normalizePassageAnalysis, normalizeQuestionAnalysis, normalizeReviewAnalysis, normalizeSplit } from './llm/normalize.js';
import { logger } from '../logger.js';
import { findBlankSentence } from '../lib/blank.js';
import { locateQuote } from '../lib/locate.js';

export interface CallCtx {
    userId?: number | null;
    provider?: Provider;
    purpose?: string;
}

/** 校验失败时记录问题项，方便后台排查（不抛出给用户） */
function reportInvalid(what: string, issues: z.ZodIssue[]): void {
    logger.warn(`${what} 归一化后仍有 ${issues.length} 处不符合契约：` +
        issues.slice(0, 5).map((i) => `${i.path.join('.')} ${i.message}`).join(' | '));
}

/** 切分试卷文本 */
export async function splitWorksheet(
    text: string,
    opts: { type?: QuestionType; extra?: string } & CallCtx = {}
): Promise<{ result: SplitResult; usage: { total: number }; model: string }> {
    const prompt = buildSplitPrompt(text, { type: opts.type, extra: opts.extra });
    const r = await chatJson({
        ...prompt,
        provider: opts.provider,
        userId: opts.userId,
        purpose: opts.purpose || 'split',
        maxTokens: 8000,
        temperature: 0.1
    });
    const normalized = normalizeSplit(r.data);
    const parsed = splitResultSchema.safeParse(normalized);
    if (!parsed.success) {
        reportInvalid('切分', parsed.error.issues);
        // 兜底：把原文整段当作单篇，题目留空，交给老师手动补充
        const fallback: SplitResult = { passages: [{ label: 'P1', content: text }], questions: [], notes: '模型返回结构不完整，已保留原文，请手动补充题目。' };
        return { result: fallback, usage: r.usage, model: r.model };
    }
    return { result: parsed.data, usage: r.usage, model: r.model };
}

/** 单题讲评 */
export async function analyzeQuestion(
    input: {
        type: QuestionType;
        numberLabel: string;
        stem: string;
        options: { label: string; text: string }[];
        passage: string;
        knownAnswer?: string;
    },
    ctx: CallCtx = {}
): Promise<{
    analysis: QuestionAnalysis;
    /** 服务端算出的原文出处偏移（优先于模型给的片段） */
    source: { start: number; end: number } | null;
    usage: { total: number };
    model: string;
}> {
    const prompt = buildQuestionPrompt(input);
    const r = await chatJson({
        ...prompt,
        provider: ctx.provider,
        userId: ctx.userId,
        purpose: ctx.purpose || 'question',
        maxTokens: 6000,
        temperature: 0.3
    });
    const normalized = normalizeQuestionAnalysis(r.data);
    const parsed = questionAnalysisSchema.safeParse(normalized);
    const analysis: QuestionAnalysis = parsed.success
        ? { ...parsed.data }
        : questionAnalysisSchema.parse({
              ...normalized,
              vocabulary: Array.isArray(normalized.vocabulary) ? normalized.vocabulary : [],
              longSentences: Array.isArray(normalized.longSentences) ? normalized.longSentences : []
          });
    if (!parsed.success) reportInvalid('单题讲评', parsed.error.issues);

    // 答案以老师/答案卷为准：模型给的答案只作为兜底
    if (input.knownAnswer && input.knownAnswer.trim()) {
        analysis.answer = input.knownAnswer.trim();
    } else if (!analysis.answer && input.knownAnswer) {
        analysis.answer = input.knownAnswer;
    }

    // 出处：空位题按题号精确算（模型经常抄错句子），其余题型用模型片段做定位
    let source: { start: number; end: number } | null = null;
    if (input.type === 'cloze' || input.type === 'grammar' || input.type === 'seven_five') {
        const blank = findBlankSentence(input.passage, input.numberLabel);
        if (blank) {
            source = { start: blank.start, end: blank.end };
            analysis.sourceQuote = blank.text;
        }
    }
    if (!source && analysis.sourceQuote) {
        const located = locateQuote(input.passage, analysis.sourceQuote);
        if (located) source = { start: located.start, end: located.end };
    }

    return { analysis, source, usage: r.usage, model: r.model };
}

/** 整篇汇总 */
export async function summarizePassage(
    passage: string,
    label: string,
    index: number,
    ctx: CallCtx = {}
): Promise<{ analysis: ReviewAnalysis['passages'][number]; usage: { total: number } }> {
    const prompt = buildPassageSummaryPrompt(passage, label);
    const r = await chatJson({
        ...prompt,
        provider: ctx.provider,
        userId: ctx.userId,
        purpose: ctx.purpose || 'summary',
        maxTokens: 4000,
        temperature: 0.3
    });
    const normalized = normalizePassageAnalysis(r.data, index);
    const parsed = passageAnalysisSchema.safeParse(normalized);
    if (!parsed.success) {
        reportInvalid('原文汇总', parsed.error.issues);
        return { analysis: { passageIndex: index, summary: '', vocabulary: [], longSentences: [] }, usage: r.usage };
    }
    return { analysis: { ...parsed.data, passageIndex: index }, usage: r.usage };
}

/** 讲评整体概览（把若干篇的概要合成一段话） */
export function buildOverview(passages: { summary: string }[]): string {
    return passages.map((p) => p.summary).filter(Boolean).join('\n');
}

export { normalizeReviewAnalysis };
