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

/** 长试卷按「题型小节」切块，避免单次输出超过 max_tokens 被截断 */
const SECTION_RE = /(?=第[一二三四五六七八九十]+部分|^\s*(?:完形填空|阅读理解|七选五|语法填空|听力|写作|读后续写)\s*$)/m;

function splitIntoSections(text: string, maxChars = 5200): string[] {
    if (text.length <= maxChars) return [text];

    // 先按题型小节切
    const raw: string[] = [];
    const positions: number[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(SECTION_RE.source, 'gm');
    while ((m = re.exec(text))) {
        if (m.index > 0) positions.push(m.index);
        if (re.lastIndex === m.index) re.lastIndex++; // 防零宽死循环
    }
    if (positions.length) {
        const bounds = [0, ...positions, text.length];
        for (let i = 0; i < bounds.length - 1; i++) raw.push(text.slice(bounds[i], bounds[i + 1]));
    } else {
        raw.push(text);
    }

    // 单块仍超长则按段落继续切
    const out: string[] = [];
    for (const chunk of raw) {
        if (chunk.length <= maxChars) { out.push(chunk); continue; }
        const paras = chunk.split(/\n{2,}/);
        let buf = '';
        for (const p of paras) {
            if ((buf + '\n\n' + p).length > maxChars && buf) { out.push(buf); buf = p; }
            else buf = buf ? buf + '\n\n' + p : p;
        }
        if (buf) out.push(buf);
    }
    return out.filter((c) => c.trim().length > 0);
}

/** 切分试卷文本（长试卷自动分块后合并，避免 max_tokens 截断） */
export async function splitWorksheet(
    text: string,
    opts: { type?: QuestionType; extra?: string } & CallCtx = {}
): Promise<{ result: SplitResult; usage: { total: number }; model: string }> {
    const chunks = splitIntoSections(text);
    let totalTokens = 0;
    let model = '';
    const passages: SplitResult['passages'] = [];
    const questions: SplitResult['questions'] = [];
    const notes: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const prompt = buildSplitPrompt(chunk, {
            type: opts.type,
            extra: chunks.length > 1 ? `${opts.extra || ''}\n这是整份试卷的第 ${i + 1}/${chunks.length} 段，只处理本段内容，题号用原卷题号。`.trim() : opts.extra
        });
        const r = await chatJson({
            ...prompt,
            provider: opts.provider,
            userId: opts.userId,
            purpose: opts.purpose || 'split',
            maxTokens: 16000,
            temperature: 0.1
        });
        totalTokens += r.usage.total;
        model = r.model;

        const normalized = normalizeSplit(r.data);
        const parsed = splitResultSchema.safeParse(normalized);
        if (!parsed.success) {
            reportInvalid(`切分（第 ${i + 1} 段）`, parsed.error.issues);
            notes.push(`第 ${i + 1} 段结构不完整，已保留原文待人工补充。`);
            passages.push({ label: `P${passages.length + 1}`, content: chunk, vocabulary: [], longSentences: [] });
            continue;
        }

        const part = parsed.data;
        const offset = passages.length;
        for (const p of part.passages) passages.push(p);
        for (const q of part.questions) {
            questions.push({
                ...q,
                // 跨块时 passageIndex 需要加上前面已累计的篇数，否则会指错原文
                passageIndex: Math.min(offset + (q.passageIndex || 1), Math.max(1, passages.length))
            });
        }
        if (part.notes) notes.push(part.notes);
    }

    if (!passages.length) {
        return {
            result: {
                passages: [{ label: 'P1', content: text, vocabulary: [], longSentences: [] }],
                questions: [],
                notes: '模型返回结构不完整，已保留原文，请手动补充题目。'
            },
            usage: { total: totalTokens },
            model
        };
    }

    return {
        result: { passages, questions, notes: notes.join(' ') },
        usage: { total: totalTokens },
        model
    };
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
