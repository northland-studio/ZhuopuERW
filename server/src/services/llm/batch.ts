import { z } from 'zod';
import { questionAnalysisSchema, type QuestionAnalysis } from '../../contracts.js';
import { chatJson, type Provider } from './index.js';
import { normalizeQuestionAnalysis } from './normalize.js';
import { JSON_RULE, TYPE_GUIDE, type QuestionType } from '../../contracts.js';
import { findBlankSentence } from '../../lib/blank.js';
import { logger } from '../../logger.js';

/**
 * 一次调用返回整篇的全部信息：
 *   每道题的讲评（考点/思路/答案/干扰项/词汇/长难句/选项解析/教学建议）
 *   + 这篇原文的汇总（概要、重难点词汇、长难句）
 *
 * 之前的做法是「逐题一次 + 再单独一次汇总」，一篇 15 题要 16 次调用；
 * 现在同一篇只调一次，答案与长难句一起给出，不再有第二次「长难句提取」。
 */

export const batchQuestionSchema = z.object({
    numberLabel: z.string().default(''),
    skill: z.string().default(''),
    reasoning: z.string().default(''),
    answer: z.string().default(''),
    distractors: z.array(z.object({ label: z.string().default(''), why: z.string().default('') })).default([]),
    vocabulary: z.array(z.any()).default([]),
    longSentences: z.array(z.any()).default([]),
    optionGlosses: z.array(z.any()).default([]),
    sourceQuote: z.string().default(''),
    teachingTips: z.array(z.string()).default([])
});

export const batchResultSchema = z.object({
    questions: z.array(batchQuestionSchema).default([]),
    passage: z
        .object({
            summary: z.string().default(''),
            vocabulary: z.array(z.any()).default([]),
            longSentences: z.array(z.any()).default([])
        })
        .default({ summary: '', vocabulary: [], longSentences: [] })
});

export type BatchResult = z.infer<typeof batchResultSchema>;

function buildBatchPrompt(input: {
    type: QuestionType;
    passage: string;
    passageLabel: string;
    questions: { numberLabel: string; stem: string; options: { label: string; text: string }[]; answer: string }[];
}): { system: string; user: string } {
    const list = input.questions
        .map((q) => {
            const opts = q.options.length ? '\n  选项：' + q.options.map((o) => `${o.label}. ${o.text}`).join(' / ') : '';
            return `- 第 ${q.numberLabel} 题${q.stem ? '：' + q.stem : ''}${opts}${q.answer ? `\n  参考答案：${q.answer}` : ''}`;
        })
        .join('\n');

    const system = [
        '你是资深高中英语教师，正在为**同一篇短文**的一组题目准备课堂讲评。',
        '请一次输出全部信息，不要遗漏任何题号。',
        '',
        TYPE_GUIDE[input.type],
        '',
        '每道题必须给出：',
        '- numberLabel：题号（与输入一致）',
        '- skill：考点一句话',
        '- reasoning：解题思路，2~4 句，可直接讲给学生',
        '- answer：正确答案（若输入给了参考答案，必须与之一致）',
        '- distractors：每个干扰项为什么错',
        '- vocabulary：本题涉及的重难点词汇（word 必须是英文原词，pos 用缩写，meanings 中文义项数组，usage 搭配，context 原文片段）',
        '- longSentences：本题相关的长难句（sentence 逐字原文 / analysis 结构拆解 / translation 中文翻译）',
        '- optionGlosses：完形填空必须给四个选项的词汇解析，其它题型给空数组',
        '- sourceQuote：本题在原文中的出处，逐字摘录',
        '- teachingTips：易错点与教学建议，1~3 条',
        '',
        '另外还要给出这篇短文的整体汇总 passage：',
        '- summary：80 字内中文概要',
        '- vocabulary：8~15 个高中重难点词汇（同上字段）',
        '- longSentences：2~5 个长难句（同上字段）',
        '',
        JSON_RULE,
        '',
        '输出结构：',
        '{"questions":[{"numberLabel":"41","skill":"","reasoning":"","answer":"A","distractors":[{"label":"B","why":""}],' +
            '"vocabulary":[{"word":"","pos":"n.","meanings":[""],"usage":"","context":""}],' +
            '"longSentences":[{"sentence":"","analysis":"","translation":""}],' +
            '"optionGlosses":[{"label":"A","text":"","pos":"v.","meaning":"","usage":""}],' +
            '"sourceQuote":"","teachingTips":[""]}],' +
            '"passage":{"summary":"","vocabulary":[],"longSentences":[]}}'
    ].join('\n');

    const user = [
        `题型：${input.type}`,
        `原文（${input.passageLabel}）：`,
        '----',
        input.passage,
        '----',
        '需要讲评的题目：',
        list,
        '',
        '请一次输出 JSON。'
    ].join('\n');

    return { system, user };
}

export interface BatchQuestionOut {
    numberLabel: string;
    analysis: QuestionAnalysis;
    source: { start: number; end: number } | null;
}

export async function analyzePassageBatch(
    input: {
        type: QuestionType;
        passage: string;
        passageLabel: string;
        questions: { numberLabel: string; stem: string; options: { label: string; text: string }[]; answer: string }[];
    },
    ctx: { userId?: number | null; provider?: Provider } = {}
): Promise<{
    questions: BatchQuestionOut[];
    passage: { summary: string; vocabulary: unknown[]; longSentences: unknown[] };
    usage: { total: number };
    model: string;
}> {
    const prompt = buildBatchPrompt(input);
    const r = await chatJson({
        ...prompt,
        provider: ctx.provider,
        userId: ctx.userId,
        purpose: 'batch',
        maxTokens: 8000,
        temperature: 0.25
    });

    const raw = (r.data ?? {}) as Record<string, unknown>;
    const parsed = batchResultSchema.safeParse(raw);
    const data: BatchResult = parsed.success
        ? parsed.data
        : {
              questions: Array.isArray(raw.questions) ? (raw.questions as BatchResult['questions']) : [],
              passage: {
                  summary: String((raw.passage as { summary?: string })?.summary ?? ''),
                  vocabulary: (raw.passage as { vocabulary?: unknown[] })?.vocabulary ?? [],
                  longSentences: (raw.passage as { longSentences?: unknown[] })?.longSentences ?? []
              }
          };
    if (!parsed.success) logger.warn(`批量讲评返回结构不完全符合契约，已尽力归一化（${parsed.error.issues.length} 处）`);

    const byLabel = new Map(data.questions.map((q) => [String(q.numberLabel).trim(), q]));
    const out: BatchQuestionOut[] = [];

    for (const q of input.questions) {
        const hit = byLabel.get(String(q.numberLabel).trim());
        if (!hit) {
            logger.warn(`批量讲评缺少第 ${q.numberLabel} 题`);
            continue;
        }
        const normalized = normalizeQuestionAnalysis(hit);
        const parsedQ = questionAnalysisSchema.safeParse(normalized);
        const analysis: QuestionAnalysis = parsedQ.success
            ? parsedQ.data
            : questionAnalysisSchema.parse({
                  ...normalized,
                  vocabulary: Array.isArray(normalized.vocabulary) ? normalized.vocabulary : [],
                  longSentences: Array.isArray(normalized.longSentences) ? normalized.longSentences : []
              });

        // 答案以参考答案为准
        if (q.answer && q.answer.trim()) analysis.answer = q.answer.trim();

        // 出处：空位题按题号精确算，其余用模型片段定位
        let source: { start: number; end: number } | null = null;
        if (input.type === 'cloze' || input.type === 'grammar' || input.type === 'seven_five') {
            const blank = findBlankSentence(input.passage, q.numberLabel);
            if (blank) {
                source = { start: blank.start, end: blank.end };
                analysis.sourceQuote = blank.text;
            }
        }
        out.push({ numberLabel: q.numberLabel, analysis, source });
    }

    return { questions: out, passage: data.passage, usage: r.usage, model: r.model };
}
