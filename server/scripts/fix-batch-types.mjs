import fs from 'node:fs';
import path from 'node:path';

const p = path.resolve(import.meta.dirname, '..', 'src', 'routes', 'reviews.ts');
let s = fs.readFileSync(p, 'utf8');

s = s.replace(
    `        const byPassage = new Map<number | null, typeof freshQ>();
        type Q = (typeof review.questions)[number];
        function freshQ() { return [] as Q[]; }
`,
    `        type Q = (typeof review.questions)[number];
        const byPassage = new Map<number | null, Q[]>();
`
);

fs.writeFileSync(p, s, 'utf8');
console.log('已修正按篇分组的类型');
