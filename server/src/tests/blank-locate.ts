/**
 * 空位定位的单元测试（规则代码，不依赖模型）
 * 运行：node --import tsx src/tests/blank-locate.ts
 */
import { findBlankSentence } from '../lib/blank.js';

const PASSAGE_CLOZE = `I consider myself quite a language expert. However, my "fluency" is actually 41 to whatever I have memorized from restaurant menus. When my wife's thirtieth birthday approached, I picked an Italian restaurant and decided to impress her by 42 in her native language. I saw it as a golden opportunity to 43 her Italian heritage.`;

const PASSAGE_GAOKAO = `I didn't come from a family connected to the    41    world, and I was convinced that writing wasn't for me. The movements have    62    (describe) names like "holding the ball".`;

const PASSAGE_SEVEN = `Involve your child in the daily running of the house: tidying toys, feeding the dog, watering the plants.
●    36    
When these tasks become as routine as brushing teeth, your child internalises them.`;

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, extra = '') {
    if (cond) { pass++; console.log(`  OK   ${name}`); }
    else { fails.push(name); console.log(`  FAIL ${name}${extra ? ' | ' + extra : ''}`); }
}

console.log('=== 1. 完形填空：普通空格 ===');
const a41 = findBlankSentence(PASSAGE_CLOZE, '41');
const a42 = findBlankSentence(PASSAGE_CLOZE, '42');
check('#41 命中', !!a41);
check('#42 命中', !!a42);
check('#41 与 #42 是不同句子', !!a41 && !!a42 && a41.text !== a42.text, `41="${a41?.text.slice(0, 40)}" 42="${a42?.text.slice(0, 40)}"`);
check('#42 句子包含 42', !!a42 && /42/.test(a42.text), a42?.text);
check('#41 句子包含 41', !!a41 && /41/.test(a41.text), a41?.text);

console.log('=== 2. 高考排版：多个空格占位 ===');
const b41 = findBlankSentence(PASSAGE_GAOKAO, '41');
const b62 = findBlankSentence(PASSAGE_GAOKAO, '62');
check('#41 命中（    41    ）', !!b41, b41?.marker);
check('#62 命中（含括号提示词）', !!b62, b62?.marker);
check('#62 句子含 describe', !!b62 && /describe/.test(b62.text));

console.log('=== 3. 七选五：小标题空位 ===');
const c36 = findBlankSentence(PASSAGE_SEVEN, '36');
check('#36 命中', !!c36, c36?.marker);
check('#36 回到标题行或就近句', !!c36 && /36|Involve|routine/.test(c36.text), c36?.text.slice(0, 60));

console.log('=== 4. 边界 ===');
check('不存在的题号返回 null', findBlankSentence(PASSAGE_CLOZE, '99') === null);
check('空原文返回 null', findBlankSentence('', '41') === null);

console.log(`\n=== 结果：通过 ${pass} / 失败 ${fails.length} ===`);
if (fails.length) { console.log('失败项：' + fails.join('、')); process.exitCode = 1; }
