import fs from 'node:fs';
import path from 'node:path';

const p = path.resolve(import.meta.dirname, '..', 'web', 'src', 'pages', 'ReviewDetail.tsx');
let s = fs.readFileSync(p, 'utf8');

/** 把渲染组件与类型导出，供离线页复用，保证两端界面完全一致 */
const pairs = [
    ['interface Option { label: string; text: string }', 'export interface Option { label: string; text: string }'],
    ['interface VocabItem {', 'export interface VocabItem {'],
    ['interface LongSentence {', 'export interface LongSentence {'],
    ['interface OptionGloss {', 'export interface OptionGloss {'],
    ['interface Analysis {', 'export interface Analysis {'],
    ['interface Question {', 'export interface Question {'],
    ['interface Passage { id: number; ordinal: number; label: string; content: string }', 'export interface Passage { id: number; ordinal: number; label: string; content: string; meta?: Record<string, unknown> }'],
    ['interface Review {', 'export interface Review {'],
    ['const TYPE_LABEL: Record<Question[\'type\'], string> = {', 'export const TYPE_LABEL: Record<Question[\'type\'], string> = {'],
    ['function collectVocab(review: Review): VocabItem[] {', 'export function collectVocab(review: Review): VocabItem[] {'],
    ['function PassageText({', 'export function PassageText({'],
    ['function VocabPopover({ item, x, y, onClose }', 'export function VocabPopover({ item, x, y, onClose }'],
    ['function QuestionCard({', 'export function QuestionCard({'],
    ['function LongSentenceBar({ review, onJump }', 'export function LongSentenceBar({ review, onJump }']
];

let n = 0;
for (const [from, to] of pairs) {
    if (s.includes(from)) { s = s.replace(from, to); n++; }
    else console.log(`  未匹配：${from.slice(0, 48)}`);
}
fs.writeFileSync(p, s, 'utf8');
console.log(`已导出 ${n}/${pairs.length} 个声明`);
