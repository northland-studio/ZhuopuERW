/**
 * 模型输出的归一化层。
 *
 * 真实联调发现：即使 prompt 写得再细，模型仍会时不时换字段名（meaning/definition、pos/part_of_speech，
 * 或者漏掉 word 只给释义）。这里做「宽容解析」：把常见别名映射到契约字段、清洗类型、
 * 丢掉实在无法使用的条目，再交给 zod 校验。原则是「宁可少一条，也不要整个讲评失败」。
 */

type Any = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => {
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return v.map((x) => str(x)).filter(Boolean).join('；');
    return fallback;
};

const pick = (o: Any, keys: string[]): unknown => {
    for (const k of keys) {
        if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
    }
    return undefined;
};

const strArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map((x) => str(x)).filter(Boolean);
    const s = str(v);
    if (!s) return [];
    return s.split(/[；;、,|/]/).map((x) => x.trim()).filter(Boolean);
};

const list = (v: unknown): Any[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') as Any[] : []);

/** 词汇条目 */
function normalizeVocab(item: unknown): Any | null {
    if (typeof item === 'string') {
        const word = item.trim();
        return word ? { word, pos: '', meanings: [], usage: '', context: '' } : null;
    }
    if (!item || typeof item !== 'object') return null;
    const o = item as Any;
    const word = str(pick(o, ['word', 'term', 'phrase', 'word_phrase', 'headword', 'entry'])) ||
        // 有些模型把词放在 key 里：{"word": {"pos": ...}}
        (typeof o.selection === 'string' ? str(o.selection) : '');
    const meanings = strArray(pick(o, ['meanings', 'meaning', 'definition', 'definitions', 'gloss', 'sense', 'chinese']));
    if (!word && meanings.length === 0) return null;
    return {
        word: word || meanings[0] || '',
        pos: str(pick(o, ['pos', 'part_of_speech', 'partOfSpeech', 'type', '词性'])),
        meanings,
        usage: str(pick(o, ['usage', 'collocation', 'collocations', 'note', 'notes', '用法', '搭配'])),
        context: str(pick(o, ['context', 'example', 'sentence', 'original', '例句']))
    };
}

/** 长难句 */
function normalizeLongSentence(item: unknown): Any | null {
    if (typeof item === 'string') {
        const sentence = item.trim();
        return sentence ? { sentence, analysis: '', translation: '' } : null;
    }
    if (!item || typeof item !== 'object') return null;
    const o = item as Any;
    const sentence = str(pick(o, ['sentence', 'text', 'quote', 'original', 'en']));
    if (!sentence) return null;
    return {
        sentence,
        analysis: str(pick(o, ['analysis', 'structure', 'explain', 'explanation', 'analysis_zh', '结构'])),
        translation: str(pick(o, ['translation', 'meaning', 'zh', 'cn', 'translation_zh', '翻译']))
    };
}

/** 选项词汇解析（完形填空） */
function normalizeOptionGloss(item: unknown, index: number): Any | null {
    if (!item || typeof item !== 'object') return null;
    const o = item as Any;
    const label = str(pick(o, ['label', 'option', 'letter', 'key'])) || String.fromCharCode(65 + index);
    const text = str(pick(o, ['text', 'word', 'content', 'value', '选项']));
    const meaning = str(pick(o, ['meaning', 'meanings', 'definition', 'chinese', '释义']));
    if (!text && !meaning) return null;
    return {
        label,
        text: text || meaning,
        pos: str(pick(o, ['pos', 'part_of_speech', 'type', '词性'])),
        meaning,
        usage: str(pick(o, ['usage', 'collocation', 'note', '搭配']))
    };
}

/** 干扰项 */
function normalizeDistractor(item: unknown, index: number): Any | null {
    if (typeof item === 'string') return { label: String.fromCharCode(65 + index), why: item.trim() };
    if (!item || typeof item !== 'object') return null;
    const o = item as Any;
    const label = str(pick(o, ['label', 'option', 'letter']));
    const why = str(pick(o, ['why', 'reason', 'explanation', 'analysis', 'because']));
    if (!label && !why) return null;
    return { label: label || String.fromCharCode(65 + index), why };
}

/** 单题讲评 */
export function normalizeQuestionAnalysis(data: unknown): Any {
    const o = (data && typeof data === 'object' ? data : {}) as Any;
    return {
        skill: str(pick(o, ['skill', 'point', 'exam_point', '考点', 'type'])),
        reasoning: str(pick(o, ['reasoning', 'analysis', 'explanation', 'solution', 'how', '解析'])),
        answer: str(pick(o, ['answer', 'key', 'correct', 'correct_answer', '答案'])),
        distractors: list(pick(o, ['distractors', 'wrong_options', 'options_analysis']))
            .map(normalizeDistractor).filter(Boolean),
        vocabulary: list(pick(o, ['vocabulary', 'vocab', 'words', 'key_words', 'glossary']))
            .map(normalizeVocab).filter(Boolean),
        longSentences: list(pick(o, ['longSentences', 'long_sentences', 'sentences', 'difficultSentences']))
            .map(normalizeLongSentence).filter(Boolean),
        optionGlosses: list(pick(o, ['optionGlosses', 'option_glosses', 'option_analysis', 'options', 'optionVocab']))
            .map(normalizeOptionGloss).filter(Boolean),
        sourceQuote: str(pick(o, ['sourceQuote', 'source_quote', 'evidence', 'quote', 'original_sentence', '出处'])),
        teachingTips: strArray(pick(o, ['teachingTips', 'teaching_tips', 'tips', 'advice', '教学建议']))
    };
}

/** 原文汇总 */
export function normalizePassageAnalysis(data: unknown, passageIndex = 1): Any {
    const o = (data && typeof data === 'object' ? data : {}) as Any;
    return {
        passageIndex: Number(o.passageIndex ?? o.passage_index ?? passageIndex) || passageIndex,
        summary: str(pick(o, ['summary', 'overview', 'abstract', '概要'])),
        vocabulary: list(pick(o, ['vocabulary', 'vocab', 'words', 'key_words', 'glossary']))
            .map(normalizeVocab).filter(Boolean),
        longSentences: list(pick(o, ['longSentences', 'long_sentences', 'sentences', 'difficultSentences']))
            .map(normalizeLongSentence).filter(Boolean)
    };
}

/** 讲评整体汇总 */
export function normalizeReviewAnalysis(data: unknown): Any {
    const o = (data && typeof data === 'object' ? data : {}) as Any;
    const passages = list(pick(o, ['passages', 'passage_analysis']))
        .map((p, i) => normalizePassageAnalysis(p, i + 1));
    return {
        overview: str(pick(o, ['overview', 'summary', 'introduction', '总览'])),
        passages
    };
}

/** 切分结果归一化（模型常把题号写成数字、选项写成字符串） */
export function normalizeSplit(data: unknown): Any {
    const o = (data && typeof data === 'object' ? data : {}) as Any;
    const passages = list(pick(o, ['passages', 'passage', 'articles'])).map((p, i) => {
        const po = p as Any;
        return {
            label: str(pick(po, ['label', 'name', 'title'])) || `P${i + 1}`,
            content: str(pick(po, ['content', 'text', 'body', '原文']))
        };
    }).filter((p) => p.content);

    const questions = list(pick(o, ['questions', 'items', 'question'])).map((q, i) => {
        const qo = q as Any;
        const rawOptions = pick(qo, ['options', 'choices', 'option']) ?? [];
        const options = (Array.isArray(rawOptions) ? rawOptions : []).map((opt, oi) => {
            if (typeof opt === 'string') {
                const m = /^([A-G])[.、)\s]\s*(.+)$/i.exec(opt.trim());
                return m ? { label: m[1]!.toUpperCase(), text: m[2]!.trim() } : { label: String.fromCharCode(65 + oi), text: opt.trim() };
            }
            const oo = opt as Any;
            return {
                label: str(pick(oo, ['label', 'key', 'letter'])) || String.fromCharCode(65 + oi),
                text: str(pick(oo, ['text', 'content', 'value', 'word']))
            };
        });

        let type = str(pick(qo, ['type', 'question_type', '题型'])).toLowerCase();
        const typeMap: Record<string, string> = {
            cloze: 'cloze', 完形填空: 'cloze', 完形: 'cloze',
            reading: 'reading', 阅读理解: 'reading', 阅读: 'reading',
            seven_five: 'seven_five', 七选五: 'seven_five', '7选5': 'seven_five', sevenfive: 'seven_five',
            grammar: 'grammar', 语法填空: 'grammar', 语法: 'grammar'
        };
        type = typeMap[type] || 'cloze';

        return {
            passageIndex: Number(pick(qo, ['passageIndex', 'passage_index', 'passage']) ?? 1) || 1,
            type,
            numberLabel: str(pick(qo, ['numberLabel', 'number', 'no', 'index', '题号'])).replace(/^#/, '') || String(i + 1),
            stem: str(pick(qo, ['stem', 'question', 'content', '题干'])),
            options,
            answer: str(pick(qo, ['answer', 'key', 'correct', '答案'])),
            sourceQuote: str(pick(qo, ['sourceQuote', 'source_quote', 'evidence', 'quote', '出处']))
        };
    });

    return { passages, questions, notes: str(pick(o, ['notes', 'note', 'remarks', '说明'])) };
}
