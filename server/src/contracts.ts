import { z } from 'zod';

/** 四种题型 */
export const QUESTION_TYPES = ['cloze', 'reading', 'seven_five', 'grammar'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    cloze: '完形填空',
    reading: '阅读理解',
    seven_five: '七选五',
    grammar: '语法填空'
};

/* ============================================================
 * 一、切分契约：把任意输入（md/txt/docx/pdf 转出的文本）切成
 *     原文（passages）+ 题目（questions）
 * ============================================================ */

export const splitOptionSchema = z.object({
    label: z.string().default(''),
    text: z.string().default('')
});

export const splitQuestionSchema = z.object({
    /** 属于第几篇原文（从 1 开始，对应 passages 数组下标 +1） */
    passageIndex: z.number().int().min(1).default(1),
    type: z.enum(QUESTION_TYPES),
    /** 题号原文写法，如 "41"、"1"、"16" */
    numberLabel: z.string().default(''),
    /** 题干（完形填空为空，七选五为空，语法填空为含空的句子，阅读题为问题） */
    stem: z.string().default(''),
    options: z.array(splitOptionSchema).default([]),
    /** 参考答案（能确定就填，不确定留空，由老师校正） */
    answer: z.string().default(''),
    /** 该题在原文中的出处片段（用于左侧高亮），必须逐字来自原文 */
    sourceQuote: z.string().default('')
});

export const splitPassageSchema = z.object({
    label: z.string().default(''),
    /** 原文正文，保留原有换行与空位标记 */
    content: z.string().default('')
});

export const splitResultSchema = z.object({
    passages: z.array(splitPassageSchema).min(1),
    questions: z.array(splitQuestionSchema).default([]),
    /** 模型对切分结果的自我说明（缺题、看不清等），给老师看 */
    notes: z.string().default('')
});

export type SplitResult = z.infer<typeof splitResultSchema>;
export type SplitQuestion = z.infer<typeof splitQuestionSchema>;

/* ============================================================
 * 二、讲评契约：单个题目的讲评结果
 * ============================================================ */

export const vocabItemSchema = z.object({
    word: z.string(),
    pos: z.string().default(''),
    /** 主要义项，1~3 条 */
    meanings: z.array(z.string()).default([]),
    /** 用法/搭配/辨析 */
    usage: z.string().default(''),
    /** 在原文中的上下文（可选） */
    context: z.string().default('')
});

export const longSentenceSchema = z.object({
    sentence: z.string(),
    /** 结构拆解 */
    analysis: z.string().default(''),
    translation: z.string().default('')
});

export const optionGlossSchema = z.object({
    label: z.string(),
    text: z.string().default(''),
    pos: z.string().default(''),
    meaning: z.string().default(''),
    usage: z.string().default('')
});

export const questionAnalysisSchema = z.object({
    /** 考点归类，如「上下文逻辑」「动词辨析」「非谓语」 */
    skill: z.string().default(''),
    /** 解题思路（讲给学生听的口吻） */
    reasoning: z.string().default(''),
    /** 正确答案 */
    answer: z.string().default(''),
    /** 干扰项分析 */
    distractors: z.array(z.object({ label: z.string(), why: z.string() })).default([]),
    /** 重难点词汇 */
    vocabulary: z.array(vocabItemSchema).default([]),
    /** 长难句 */
    longSentences: z.array(longSentenceSchema).default([]),
    /** 完形填空专有：四个选项的词汇解析 */
    optionGlosses: z.array(optionGlossSchema).default([]),
    /** 原文出处（逐字来自原文，用于高亮） */
    sourceQuote: z.string().default(''),
    /** 教学建议（怎么讲、易错点） */
    teachingTips: z.array(z.string()).default([])
});

export type QuestionAnalysis = z.infer<typeof questionAnalysisSchema>;

/* ============================================================
 * 三、讲评汇总契约（一篇原文 / 整份讲评）
 * ============================================================ */

export const passageAnalysisSchema = z.object({
    passageIndex: z.number().int().min(1).default(1),
    summary: z.string().default(''),
    vocabulary: z.array(vocabItemSchema).default([]),
    longSentences: z.array(longSentenceSchema).default([])
});

export const reviewAnalysisSchema = z.object({
    overview: z.string().default(''),
    passages: z.array(passageAnalysisSchema).default([])
});

export type ReviewAnalysis = z.infer<typeof reviewAnalysisSchema>;

/* ============================================================
 * 四、题目分类提示 & 各题型在 prompt 里的差异点
 * ============================================================ */

export const TYPE_GUIDE: Record<QuestionType, string> = {
    cloze: [
        '题型：完形填空。原文是一段（或几段）挖空短文，每空对应一个题号，四个选项 A/B/C/D。',
        '每空必须给出：考点（上下文逻辑、词义辨析、固定搭配、语法形式等）、正确选项、逐项排除理由。',
        '必须额外给出四个选项的词汇解析（词性、主要义项、常见搭配），这是完形填空特有的要求。',
        '重难点词汇与长难句按短文整体提取，不要只挑空附近的。'
    ].join('\n'),
    reading: [
        '题型：阅读理解。一篇短文配若干小题（细节理解、推理判断、主旨大意、词义猜测、作者态度等）。',
        '每题的 evidence 必须是原文中能直接支撑答案的原句（逐字摘录，不要改写）。',
        '重难点词汇与长难句按短文整体提取。'
    ].join('\n'),
    seven_five: [
        '题型：七选五。短文中有 5 个空，给出 7 个候选句子 A-G，选出 5 个填入。',
        '每题必须说明「空前空后的逻辑线索」（代词指代、关键词复现、转折/递进/举例关系）。',
        '重难点词汇与长难句按短文整体提取。'
    ].join('\n'),
    grammar: [
        '题型：语法填空。短文中有 10 个空，部分空给出提示词（如动词原形、名词），部分空无提示。',
        '每题必须说明「所填词的语法依据」（时态、语态、非谓语、词性转换、冠词/介词/连词等）。',
        '重难点词汇与长难句按短文整体提取。'
    ].join('\n')
};

/** 统一 JSON 输出要求，所有 prompt 复用 */
export const JSON_RULE = [
    '只输出一个 JSON 对象，不要输出 markdown 代码块、解释文字或多余前后缀。',
    'JSON 必须能被 JSON.parse 直接解析：字符串内的换行用 \\n 转义，不要出现尾逗号。',
    '所有字段都要出现；没有内容时用空字符串、空数组或 null，不要省略字段。',
    '原文出处（sourceQuote）必须逐字复制自给定原文，不要改写、不要加省略号。'
].join('\n');
