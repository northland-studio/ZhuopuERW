import fs from 'node:fs';
import path from 'node:path';

const web = path.resolve(import.meta.dirname, '..', 'web', 'src');
const log = (m) => console.log(m);
let fail = 0;

function patch(rel, pairs) {
    const p = path.join(web, rel);
    let s = fs.readFileSync(p, 'utf8');
    for (const [from, to] of pairs) {
        if (!s.includes(from)) {
            console.log(`  ✗ 未匹配（${rel}）: ${from.slice(0, 60).replace(/\n/g, '\\n')}`);
            fail++;
            continue;
        }
        s = s.replace(from, to);
        console.log(`  ✓ ${rel}`);
    }
    fs.writeFileSync(p, s, 'utf8');
}

/* ---------------- 在线讲评页 ---------------- */
patch('pages/ReviewDetail.tsx', [
    [
        "import { useToast } from '../lib/toast';",
        "import { useToast } from '../lib/toast';\nimport { CompareBar } from '../components/CompareBar';\nimport { FontSizeControl } from '../components/FontSizeControl';\nimport { compareSentence } from '../lib/compare';"
    ],
    [
        `    const current = useMemo(
        () => review?.questions.find((q) => q.id === activeQ) ?? null,
        [review, activeQ]
    );`,
        `    const current = useMemo(
        () => review?.questions.find((q) => q.id === activeQ) ?? null,
        [review, activeQ]
    );

    /** 对照句：当前选中题目在原文中的对应整句 */
    const currentSentence = useMemo(() => {
        if (!review || !current) return '';
        const passage = review.passages.find((p) => p.id === current.passageId) ?? review.passages[0];
        return compareSentence(passage?.content ?? '', current);
    }, [review, current]);`
    ],
    [
        '        <div className="rd">\n            <header className="rd-head">',
        '        <div className="rd">\n            <CompareBar\n                hasQuestion={!!current}\n                numberLabel={current?.numberLabel}\n                typeLabel={current ? TYPE_LABEL[current.type] : undefined}\n                sentence={currentSentence}\n            />\n            <header className="rd-head">'
    ],
    [
        '            <LongSentenceBar review={review} onJump={(idx) => setActivePassage(idx)} />',
        '            <LongSentenceBar review={review} onJump={(idx) => setActivePassage(idx)} />\n            <FontSizeControl />'
    ]
]);

/* ---------------- 离线讲评页 ---------------- */
patch('pages/LocalReviews.tsx', [
    [
        "import { desktop, hasDesktop } from '../lib/desktop';",
        "import { desktop, hasDesktop } from '../lib/desktop';\nimport { CompareBar } from '../components/CompareBar';\nimport { FontSizeControl } from '../components/FontSizeControl';\nimport { compareSentence } from '../lib/compare';"
    ],
    [
        `    const vocabAll = collectVocab(review);`,
        `    const vocabAll = collectVocab(review);
    const currentSentence = compareSentence(passage?.content ?? '', current);`
    ],
    [
        '        <div className="rd">\n            <header className="rd-head">',
        '        <div className="rd">\n            <CompareBar\n                hasQuestion={!!current}\n                numberLabel={current?.numberLabel}\n                typeLabel={current ? TYPE_LABEL[current.type] : undefined}\n                sentence={currentSentence}\n            />\n            <header className="rd-head">'
    ],
    [
        '            <LongSentenceBar review={review} onJump={(idx) => setPassageIdx(idx)} />',
        '            <LongSentenceBar review={review} onJump={(idx) => setPassageIdx(idx)} />\n            <FontSizeControl />'
    ]
]);

process.exit(fail ? 1 : 0);
