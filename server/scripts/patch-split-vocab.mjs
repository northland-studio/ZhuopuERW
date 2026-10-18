import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');           // server/
const web = path.resolve(root, '..', 'web');
const log = (m) => console.log(m);

/* ============ 1. 契约：切分结果里带每篇的重点词汇与长难句 ============ */
{
    const p = path.join(root, 'src', 'contracts.ts');
    let s = fs.readFileSync(p, 'utf8');
    if (!s.includes('passageVocabulary')) {
        s = s.replace(
            `export const splitPassageSchema = z.object({
    label: z.string().default(''),
    /** 原文正文，保留原有换行与空位标记 */
    content: z.string().default('')
});`,
            `export const splitPassageSchema = z.object({
    label: z.string().default(''),
    /** 原文正文，保留原有换行与空位标记 */
    content: z.string().default(''),
    /** 第一次解析就返回本篇的重点词汇（无需逐题讲评） */
    vocabulary: z.array(z.any()).default([]),
    /** 第一次解析就返回本篇的长难句 */
    longSentences: z.array(z.any()).default([])
});`
        );
        fs.writeFileSync(p, s, 'utf8');
        log('contracts.ts：splitPassageSchema 增加 vocabulary / longSentences');
    }
}

/* ============ 2. 提示词：要求切分时一并给出词汇与长难句 ============ */
{
    const p = path.join(root, 'src', 'services', 'llm', 'prompts.ts');
    let s = fs.readFileSync(p, 'utf8');
    if (!s.includes('每篇原文都要给出 vocabulary')) {
        s = s.replace(
            "        '5. 看不清、缺题、排版混乱的地方写在 notes 里，交给老师校正；不要臆造题目。',",
            [
                "        '5. 看不清、缺题、排版混乱的地方写在 notes 里，交给老师校正；不要臆造题目。',",
                "        '6. 每篇原文都要给出 vocabulary（8~15 个高中重难点词汇：word 英文原词 / pos 词性缩写 / meanings 中文义项数组 / usage 搭配 / context 原文片段）与 longSentences（2~5 个长难句：sentence 逐字原文 / analysis 结构拆解 / translation 中文翻译）。',",
                "        '   这两项与题目无关，是整篇的语言点汇总，必须随切分一起返回。',"
            ].join('\n')
        );
        s = s.replace(
            `        '{"passages":[{"label":"P1 完形填空","content":"..."}],"questions":[{"passageIndex":1,"type":"cloze","numberLabel":"41","stem":"","options":[{"label":"A","text":"ordering"}],"answer":"A","sourceQuote":"..."}],"notes":""}'`,
            `        '{"passages":[{"label":"P1 完形填空","content":"...","vocabulary":[{"word":"heritage","pos":"n.","meanings":["遗产"],"usage":"cultural heritage","context":"her Italian heritage"}],"longSentences":[{"sentence":"原文长句","analysis":"结构拆解","translation":"中文翻译"}]}],"questions":[{"passageIndex":1,"type":"cloze","numberLabel":"41","stem":"","options":[{"label":"A","text":"ordering"}],"answer":"A","sourceQuote":"..."}],"notes":""}'`
        );
        fs.writeFileSync(p, s, 'utf8');
        log('prompts.ts：切分提示词要求返回 vocabulary 与 longSentences');
    }
}

/* ============ 3. 归一化：切分结果里的词汇与长难句 ============ */
{
    const p = path.join(root, 'src', 'services', 'llm', 'normalize.ts');
    let s = fs.readFileSync(p, 'utf8');
    if (!s.includes('normalizeSplit') || !s.includes('passage.vocabulary')) {
        s = s.replace(
            `    const passages = list(pick(o, ['passages', 'passage', 'articles'])).map((p, i) => {
        const po = p as Any;
        return {
            label: str(pick(po, ['label', 'name', 'title'])) || \`P\${i + 1}\`,
            content: str(pick(po, ['content', 'text', 'body', '原文']))
        };
    }).filter((p) => p.content);`,
            `    const passages = list(pick(o, ['passages', 'passage', 'articles'])).map((p, i) => {
        const po = p as Any;
        return {
            label: str(pick(po, ['label', 'name', 'title'])) || \`P\${i + 1}\`,
            content: str(pick(po, ['content', 'text', 'body', '原文'])),
            vocabulary: list(pick(po, ['vocabulary', 'vocab', 'words', 'key_words']))
                .map(normalizeVocab).filter(Boolean),
            longSentences: list(pick(po, ['longSentences', 'long_sentences', 'sentences']))
                .map(normalizeLongSentence).filter(Boolean)
        };
    }).filter((p) => p.content);`
        );
        fs.writeFileSync(p, s, 'utf8');
        log('normalize.ts：切分结果归一化词汇与长难句');
    }
}

/* ============ 4. 落库：切分时写入 passages.meta ============ */
{
    const p = path.join(root, 'src', 'routes', 'reviews.ts');
    let s = fs.readFileSync(p, 'utf8');
    if (!s.includes('第一次解析就写入词汇')) {
        s = s.replace(
            "    const passageIds = mode === 'replace' ? replacePassages(review.id, passages) : [...review.passages.map((p) => p.id)];",
            `    const passageIds = mode === 'replace' ? replacePassages(review.id, passages) : [...review.passages.map((p) => p.id)];

    // 第一次解析就写入词汇与长难句（不需要逐题 AI 讲评）
    passages.forEach((p, i) => {
        const id = passageIds[i];
        if (id == null) return;
        const vocab = (p as { vocabulary?: unknown[] }).vocabulary ?? [];
        const longs = (p as { longSentences?: unknown[] }).longSentences ?? [];
        if (vocab.length || longs.length) {
            savePassageMeta(id, { vocabulary: vocab, longSentences: longs });
        }
    });
    // 汇总到整份讲评，讲评页左侧立刻能画出虚线下划线
    const vocabAll: unknown[] = [];
    const longAll: unknown[] = [];
    passages.forEach((p) => {
        vocabAll.push(...((p as { vocabulary?: unknown[] }).vocabulary ?? []));
        longAll.push(...((p as { longSentences?: unknown[] }).longSentences ?? []));
    });
    if (vocabAll.length || longAll.length) {
        const current = getReview(req.user!.id, review.id);
        saveReviewSummary(review.id, {
            summary: current?.summary ?? '',
            vocab: vocabAll,
            longSentences: longAll
        });
    }`
        );
        fs.writeFileSync(p, s, 'utf8');
        log('routes/reviews.ts：apply 时写入词汇与长难句');
    }
}

/* ============ 5. 前端：词汇来源补上 passages.meta ============ */
{
    const p = path.join(web, 'src', 'pages', 'ReviewDetail.tsx');
    let s = fs.readFileSync(p, 'utf8');
    if (!s.includes("passageMeta")) {
        s = s.replace(
            `    for (const v of review.vocab ?? []) {
        const key = v.word.toLowerCase();
        if (!map.has(key) && v.word.length > 1) map.set(key, v);
    }
    return [...map.values()];`,
            `    // 第一次解析就把词汇存进了 passages.meta，这里一并收进来
    type PassageMeta = { vocabulary?: VocabItem[]; longSentences?: LongSentence[] };
    for (const p of review.passages) {
        const meta = (p as { meta?: PassageMeta }).meta;
        for (const v of meta?.vocabulary ?? []) {
            if (!v?.word) continue;
            const key = String(v.word).toLowerCase();
            if (!map.has(key) && String(v.word).length > 1) map.set(key, v);
        }
    }
    for (const v of review.vocab ?? []) {
        const key = v.word.toLowerCase();
        if (!map.has(key) && v.word.length > 1) map.set(key, v);
    }
    return [...map.values()];`
        );
        fs.writeFileSync(p, s, 'utf8');
        log('ReviewDetail：词汇来源加入 passages.meta');
    }
}
