import { JSON_RULE, TYPE_GUIDE, type QuestionType } from '../../contracts.js';

/** 切分：把任意来源的文本切成 原文 + 题目 */
export function buildSplitPrompt(text: string, hint?: { type?: QuestionType; extra?: string }): { system: string; user: string } {
    const typeHint = hint?.type ? `\n【优先按此题型处理】${hint.type}（${TYPE_GUIDE[hint.type]}）` : '';
    const system = [
        '你是高中英语教研组的试卷结构化助手，任务是把老师提供的试卷内容整理成可讲评的结构化数据。',
        '',
        '要求：',
        '1. 识别文本中的所有「原文」（passage）与「题目」（question）。一篇试卷可能有 1~4 篇原文，各自配若干题目。',
        '2. 题型只能是以下四种之一：cloze（完形填空）、reading（阅读理解）、seven_five（七选五）、grammar（语法填空）。',
        '3. 原文 content 必须保留原文文字、段落与空位标记（如 41 ____、空格、下划线），不要翻译、不要概括、不要删改。',
        '4. 题目字段规则：',
        '   - numberLabel：题号，只写数字或题目原本的编号（如 "41"、"16"）。',
        '   - stem：阅读题为问题原文；七选五与完形填空留空；语法填空为含空的整句。',
        '   - options：完形填空 4 个、七选五 7 个（A-G）、阅读题若有选项则填；语法填空留空数组。',
        '   - answer：能确定就给答案（完形填空给字母，七选五给字母，语法填空给填写的词，阅读题给字母或文字）；不能确定留空字符串。',
        '   - sourceQuote：从对应原文里逐字摘出的、能定位该题的片段（完形填空取含该空的一句；阅读题取支撑答案的原句；七选五取空所在处上下文）。',
        '5. 看不清、缺题、排版混乱的地方写在 notes 里，交给老师校正；不要臆造题目。',
        '6. 每篇原文都要给出 vocabulary（8~15 个高中重难点词汇：word 英文原词 / pos 词性缩写 / meanings 中文义项数组 / usage 搭配 / context 原文片段）与 longSentences（2~5 个长难句：sentence 逐字原文 / analysis 结构拆解 / translation 中文翻译）。',
        '   这两项与题目无关，是整篇的语言点汇总，必须随切分一起返回。',
        '',
        JSON_RULE,
        '',
        '输出结构：',
        '{"passages":[{"label":"P1 完形填空","content":"...","vocabulary":[{"word":"heritage","pos":"n.","meanings":["遗产"],"usage":"cultural heritage","context":"her Italian heritage"}],"longSentences":[{"sentence":"原文长句","analysis":"结构拆解","translation":"中文翻译"}]}],"questions":[{"passageIndex":1,"type":"cloze","numberLabel":"41","stem":"","options":[{"label":"A","text":"ordering"}],"answer":"A","sourceQuote":"..."}],"notes":""}'
    ].join('\n');

    const user = [
        typeHint,
        hint?.extra ? `\n【老师补充说明】${hint.extra}` : '',
        '',
        '以下是试卷内容：',
        '----',
        text,
        '----'
    ].join('\n');

    return { system, user };
}

/** 单题讲评 */
export function buildQuestionPrompt(input: {
    type: QuestionType;
    numberLabel: string;
    stem: string;
    options: { label: string; text: string }[];
    passage: string;
    knownAnswer?: string;
}): { system: string; user: string } {
    const system = [
        '你是资深高中英语教师，正在为一个题目准备课堂讲评材料。讲评对象是学生，语言要清楚、可直接讲。',
        '',
        TYPE_GUIDE[input.type],
        '',
        '输出必须包含：',
        '- skill：本题考点的一句话说清（如「考查上下文逻辑中的转折关系」）。',
        '- reasoning：解题思路，先给结论再讲依据，2~4 句，口语化但专业。',
        '- answer：正确答案。',
        '- distractors：每个干扰项为什么错（数组，元素 {"label":"B","why":"..."}）；完形填空与七选五必须逐项写。',
        '- vocabulary：重难点词汇 3~8 个。**word 必须是英文原词**（如 "heritage"），不要写中文，不要带括号注释；pos 用缩写（n./v./adj./adv./prep./phr.）；meanings 是中文义项数组；usage 写搭配或辨析；context 摘录原文中含该词的片段。',
        '- longSentences：长难句 0~3 个，含句子原文 sentence、结构分析 analysis、中文翻译 translation。',
        '- optionGlosses：完形填空必须给出四个选项的词汇解析（label/text/pos/meaning/usage），其它题型给空数组。',
        '- sourceQuote：该题在原文中的出处，逐字摘录原文（不要改写、不要用省略号）。',
        '- teachingTips：课堂易错点与教学建议，1~3 条。',
        '',
        '输出示例（结构必须完全一致，只是内容不同）：',
        '{"skill":"考查名词词义辨析","reasoning":"由下文 ... 可知，此处表示 ...，故选 X。","answer":"B",' +
        '"distractors":[{"label":"A","why":"..."},{"label":"C","why":"..."},{"label":"D","why":"..."}],' +
        '"vocabulary":[{"word":"heritage","pos":"n.","meanings":["遗产","传统"],"usage":"cultural heritage 文化遗产","context":"her family\'s Italian heritage"}],' +
        '"longSentences":[{"sentence":"原文长句","analysis":"主句 + 定语从句","translation":"中文翻译"}],' +
        '"optionGlosses":[{"label":"A","text":"ordering","pos":"v.","meaning":"点餐；订购","usage":"order food 点餐"}],' +
        '"sourceQuote":"原文中的原句","teachingTips":["易错点：..."]}',
        '',
        JSON_RULE
    ].join('\n');

    const user = [
        `题型：${input.type}`,
        `题号：${input.numberLabel || '（未编号）'}`,
        input.knownAnswer ? `已知参考答案：${input.knownAnswer}` : '',
        '',
        '【原文】',
        input.passage,
        '',
        '【本题】',
        input.stem ? `题干：${input.stem}` : '',
        input.options.length ? '选项：\n' + input.options.map((o) => `${o.label}. ${o.text}`).join('\n') : '',
        '',
        '请输出讲评 JSON。'
    ].filter(Boolean).join('\n');

    return { system, user };
}

/** 整篇原文的汇总（词汇 + 长难句 + 概览），用于「整篇讲评」与 词汇表 */
export function buildPassageSummaryPrompt(passage: string, label: string): { system: string; user: string } {
    const system = [
        '你是高中英语教研员。请为一篇英语短文整理讲评用的语言点汇总，面向高中课堂。',
        '',
        '要求：',
        '- summary：80 字以内的中文概要，说明文本体裁、话题与语言难度。',
        '- vocabulary：8~15 个高中阶段重难点词汇，含 word/pos/meanings/usage/context。',
        '- longSentences：2~5 个长难句，含 sentence（逐字原文）/analysis（结构拆解）/translation（中文翻译）。',
        '',
        JSON_RULE,
        '',
        '输出结构：{"passageIndex":1,"summary":"","vocabulary":[],"longSentences":[]}'
    ].join('\n');
    return { system, user: `【原文：${label}】\n${passage}\n\n请输出 JSON。` };
}
