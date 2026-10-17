import { cleanMarkdown } from '../lib/markdown.js';

const samples = [
    'I didn\'t come from a family connected to the \\_\\_41\\_\\_ world, which I perceived as a major \\_\\_42\\_\\_.',
    'The movements have \\41\\ (describe) names like "holding the ball".',
    '**Passage A**\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nText with [link](https://x.com) and <b>tag</b>.',
    '\\_\\_\\_\\_ 36 \\_\\_\\_\\_',
    '\\# Heading\nnormal line'
];

for (const s of samples) {
    console.log('--- 原 ---');
    console.log(JSON.stringify(s));
    console.log('--- 清洗后 ---');
    console.log(JSON.stringify(cleanMarkdown(s)));
}
