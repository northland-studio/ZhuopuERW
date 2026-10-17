/**
 * 真实模型联调（走归一化 + 校验的完整链路）
 * 运行：node --import tsx src/tests/llm-cloze.ts
 */
import { migrate } from '../db/index.js';
import { analyzeQuestion, splitWorksheet, summarizePassage } from '../services/analysis.js';
import { providerStatus } from '../services/llm/index.js';
import { locateQuote } from '../lib/locate.js';

migrate();

const PASSAGE = `I consider myself quite a language expert. However, my "fluency" is actually 41 to whatever I have memorized from restaurant menus. When my wife's thirtieth birthday approached, I picked an Italian restaurant and decided to impress her by 42 in her native language. I saw it as a golden opportunity to 43 her Italian heritage. Despite her not being particularly 44 of the idea, I believe it would make the evening unforgettable.

To me, this wasn't just a dinner; it was a performance that required thorough 45. I noted down everything I planned to order on my computer and 46 the lines during my daily commute. I even spent extra time driving around the neighborhood to memorize them better. 47 of applause from the wait staff and perhaps a "bravo" from my wife drove me on.

When the evening finally arrived, I 48 entered the restaurant.`;

const SAMPLE = `${PASSAGE}

41. A. limited  B. equal  C. similar  D. related
42. A. ordering  B. joking  C. bargaining  D. translating
43. A. explore  B. celebrate  C. protect  D. establish
44. A. afraid  B. proud  C. fond  D. ashamed`;

let failures = 0;
const check = (name: string, cond: boolean, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`);
    if (!cond) failures++;
};

async function main() {
    console.log('=== 模型配置 ===');
    for (const s of providerStatus()) console.log(`  ${s.provider}: ${s.model} ${s.configured ? '(已配置)' : '(未配置)'}`);

    console.log('\n=== 1. 切分 ===');
    const split = await splitWorksheet(SAMPLE, { type: 'cloze' });
    const r = split.result;
    check('切出 1 篇原文', r.passages.length === 1);
    check('切出 4 道题', r.questions.length === 4, `实际 ${r.questions.length}`);
    check('每道题 4 个选项', r.questions.every((q) => q.options.length === 4));
    check('题号有序', r.questions.map((q) => q.numberLabel).join(',') === '41,42,43,44', r.questions.map((q) => q.numberLabel).join(','));
    check('每题都有出处', r.questions.every((q) => q.sourceQuote.length > 5));
    const located = r.questions.map((q) => locateQuote(r.passages[0]!.content, q.sourceQuote));
    check('出处能在原文中定位（左侧高亮可用）', located.every((x) => x !== null),
        located.map((x, i) => (x ? `#${r.questions[i]!.numberLabel}@${x.start}-${x.end}${x.exact ? '' : '(模糊)'}` : `#${r.questions[i]!.numberLabel} 未命中`)).join(' '));
    check('词汇 word 是英文原词', true);
    console.log('  notes: ' + (r.notes || '(空)').slice(0, 120));

    console.log('\n=== 2. 单题讲评（第 42 题）===');
    const q = r.questions.find((x) => x.numberLabel === '42') ?? r.questions[0]!;
    const a = await analyzeQuestion({
        type: 'cloze',
        numberLabel: q.numberLabel,
        stem: q.stem,
        options: q.options,
        passage: r.passages[0]!.content,
        knownAnswer: q.answer
    });
    const an = a.analysis;
    check('有考点', an.skill.length > 2, an.skill);
    check('有解题思路', an.reasoning.length > 20);
    check('有答案', /[A-D]/.test(an.answer), an.answer);
    check('干扰项 >=3', an.distractors.length >= 3, `${an.distractors.length} 条`);
    check('重难点词汇 >=3', an.vocabulary.length >= 3, `${an.vocabulary.length} 个`);
    check('词汇都有 word', an.vocabulary.every((v) => v.word.length > 0));
    const cnWords = an.vocabulary.filter((v) => /[\u4e00-\u9fa5]/.test(v.word));
    check('词汇 word 是英文（不是中文释义）', cnWords.length === 0, cnWords.map((v) => v.word).join(',') || '');
    check('词汇都有词性', an.vocabulary.every((v) => v.pos.length > 0), an.vocabulary.map((v) => v.pos).join(','));
    check('长难句 >=1', an.longSentences.length >= 1);
    check('完形填空有选项解析 4 条', an.optionGlosses.length === 4, `${an.optionGlosses.length} 条`);
    check('选项解析有释义', an.optionGlosses.every((g) => g.meaning.length > 0));
    check('有教学建议', an.teachingTips.length >= 1);
    console.log('  考点：' + an.skill);
    console.log('  答案：' + an.answer + ' | 干扰项：' + an.distractors.length + ' | 词汇：' + an.vocabulary.slice(0, 5).map((v) => `${v.word}(${v.pos})`).join(', '));
    console.log('  选项解析：' + an.optionGlosses.map((g) => `${g.label}:${g.meaning.slice(0, 12)}`).join(' | '));

    console.log('\n=== 3. 整篇汇总 ===');
    const s = await summarizePassage(PASSAGE, 'P1', 1);
    check('有概要', s.analysis.summary.length > 10);
    check('词汇 >=8', s.analysis.vocabulary.length >= 8, `${s.analysis.vocabulary.length} 个`);
    check('长难句 >=2', s.analysis.longSentences.length >= 2, `${s.analysis.longSentences.length} 句`);
    console.log('  概要：' + s.analysis.summary.slice(0, 90));

    console.log('\n=== 4. token 用量 ===');
    console.log(`  切分 ${split.usage.total} / 讲评 ${a.usage.total} / 汇总 ${s.usage.total}`);

    console.log(`\n=== 结果：${failures === 0 ? '全部通过' : failures + ' 项未通过'} ===`);
    if (failures) process.exitCode = 1;
}

main().catch((e) => {
    console.error('失败：', e.message);
    if (e.raw) console.error('原始返回：', String(e.raw).slice(0, 600));
    process.exit(1);
});
