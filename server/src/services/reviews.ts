import crypto from 'node:crypto';
import { all, get, now, parseJson, run, tx } from '../db/index.js';
import { locateQuote } from '../lib/locate.js';
import { logger } from '../logger.js';
import type { QuestionAnalysis, QuestionType, ReviewAnalysis } from '../contracts.js';

export interface PassageRow {
    id: number;
    review_set_id: number;
    ordinal: number;
    label: string;
    content: string;
    meta: string;
}

export interface QuestionRow {
    id: number;
    review_set_id: number;
    passage_id: number | null;
    ordinal: number;
    type: QuestionType;
    number_label: string;
    stem: string;
    options: string;
    answer: string;
    source_start: number | null;
    source_end: number | null;
    analysis: string;
    analyzed_at: string | null;
}

export interface ReviewRow {
    id: number;
    user_id: number;
    title: string;
    kind: 'review' | 'single';
    status: string;
    source: string;
    summary: string | null;
    vocab: string | null;
    long_sentences: string | null;
    meta: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

/** 默认讲评名：MM月DD日的讲评 */
export function defaultTitle(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}月${p(d.getDate())}日的讲评`;
}

export interface QuestionDto {
    id: number;
    passageId: number | null;
    ordinal: number;
    type: QuestionType;
    numberLabel: string;
    stem: string;
    options: { label: string; text: string }[];
    answer: string;
    sourceStart: number | null;
    sourceEnd: number | null;
    analysis: Partial<QuestionAnalysis> & { analysisModel?: string; analyzedAt?: string | null };
    analyzedAt: string | null;
}

export interface ReviewDto {
    id: number;
    title: string;
    kind: 'review' | 'single';
    status: string;
    source: string;
    summary: string;
    vocab: ReviewAnalysis['passages'][number]['vocabulary'];
    longSentences: ReviewAnalysis['passages'][number]['longSentences'];
    passages: { id: number; ordinal: number; label: string; content: string; meta: Record<string, unknown> }[];
    questions: QuestionDto[];
    createdAt: string;
    updatedAt: string;
}

function toQuestionDto(row: QuestionRow): QuestionDto {
    return {
        id: row.id,
        passageId: row.passage_id,
        ordinal: row.ordinal,
        type: row.type,
        numberLabel: row.number_label,
        stem: row.stem,
        options: parseJson(row.options, [] as { label: string; text: string }[]),
        answer: row.answer,
        sourceStart: row.source_start,
        sourceEnd: row.source_end,
        analysis: parseJson(row.analysis, {} as QuestionAnalysis),
        analyzedAt: row.analyzed_at
    };
}

export function listReviews(userId: number, kind?: 'review' | 'single') {
    const rows = all<ReviewRow & { question_count: number; passage_count: number }>(
        `SELECT r.*,
                (SELECT COUNT(*) FROM questions q WHERE q.review_set_id = r.id) AS question_count,
                (SELECT COUNT(*) FROM passages p WHERE p.review_set_id = r.id) AS passage_count
           FROM review_sets r
          WHERE r.user_id = ? AND r.deleted_at IS NULL ${kind ? 'AND r.kind = ?' : ''}
          ORDER BY r.updated_at DESC`,
        ...(kind ? [userId, kind] : [userId])
    );
    return rows.map((r) => ({
        id: r.id,
        title: r.title,
        kind: r.kind,
        status: r.status,
        source: r.source,
        questionCount: r.question_count,
        passageCount: r.passage_count,
        createdAt: r.created_at,
        updatedAt: r.updated_at
    }));
}

export function getReview(userId: number, id: number, opts: { allowShared?: boolean } = {}): ReviewDto | null {
    const row = opts.allowShared
        ? get<ReviewRow>('SELECT * FROM review_sets WHERE id = ? AND deleted_at IS NULL', id)
        : get<ReviewRow>('SELECT * FROM review_sets WHERE id = ? AND user_id = ? AND deleted_at IS NULL', id, userId);
    if (!row) return null;

    const passages = all<PassageRow>('SELECT * FROM passages WHERE review_set_id = ? ORDER BY ordinal, id', id);
    const questions = all<QuestionRow>('SELECT * FROM questions WHERE review_set_id = ? ORDER BY ordinal, id', id);

    return {
        id: row.id,
        title: row.title,
        kind: row.kind,
        status: row.status,
        source: row.source,
        summary: row.summary ?? '',
        vocab: parseJson(row.vocab, [] as ReviewDto['vocab']),
        longSentences: parseJson(row.long_sentences, [] as ReviewDto['longSentences']),
        passages: passages.map((p) => ({
            id: p.id,
            ordinal: p.ordinal,
            label: p.label,
            content: p.content,
            meta: parseJson(p.meta, {})
        })),
        questions: questions.map(toQuestionDto),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export function createReview(userId: number, input: { title?: string; kind?: 'review' | 'single'; source?: string } = {}): ReviewDto {
    const kind = input.kind ?? 'review';
    const title = (input.title || '').trim() || defaultTitle();
    const r = run(
        `INSERT INTO review_sets (user_id, title, kind, status, source, summary, vocab, long_sentences, meta, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, '', '[]', '[]', '{}', ?, ?)`,
        userId, title, kind, input.source ?? 'cloud', now(), now()
    );
    return getReview(userId, r.lastInsertRowid)!;
}

export function renameReview(userId: number, id: number, title: string): boolean {
    const t = title.trim();
    if (!t) return false;
    return run('UPDATE review_sets SET title = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL', t, now(), id, userId).changes > 0;
}

export function softDeleteReview(userId: number, id: number): boolean {
    return run('UPDATE review_sets SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', now(), now(), id, userId).changes > 0;
}

export function touchReview(id: number): void {
    run('UPDATE review_sets SET updated_at = ? WHERE id = ?', now(), id);
}

/** 覆盖写入原文（切分结果落到库里时用） */
export function replacePassages(reviewSetId: number, passages: { label?: string; content: string }[]): number[] {
    return tx(() => {
        run('DELETE FROM passages WHERE review_set_id = ?', reviewSetId);
        const ids: number[] = [];
        passages.forEach((p, i) => {
            const r = run(
                'INSERT INTO passages (review_set_id, ordinal, label, content, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                reviewSetId, i + 1, p.label || `P${i + 1}`, p.content, '{}', now()
            );
            ids.push(r.lastInsertRowid);
        });
        touchReview(reviewSetId);
        return ids;
    });
}

export interface QuestionInput {
    passageId?: number | null;
    type: QuestionType;
    numberLabel?: string;
    stem?: string;
    options?: { label: string; text: string }[];
    answer?: string;
    sourceQuote?: string;
    /** 已有原文时用于定位高亮 */
    passageContent?: string;
}

/** 追加一批题目（切分结果 / 手动录入） */
export function appendQuestions(reviewSetId: number, inputs: QuestionInput[]): number[] {
    return tx(() => {
        const startOrdinal =
            (get<{ m: number }>('SELECT COALESCE(MAX(ordinal), 0) AS m FROM questions WHERE review_set_id = ?', reviewSetId)?.m ?? 0) + 1;
        const ids: number[] = [];
        inputs.forEach((q, i) => {
            let start: number | null = null;
            let end: number | null = null;
            if (q.sourceQuote && q.passageContent) {
                const located = locateQuote(q.passageContent, q.sourceQuote);
                if (located) { start = located.start; end = located.end; }
            }
            const r = run(
                `INSERT INTO questions (review_set_id, passage_id, ordinal, type, number_label, stem, options, answer, source_start, source_end, analysis, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
                reviewSetId, q.passageId ?? null, startOrdinal + i, q.type,
                (q.numberLabel || '').trim(), q.stem || '', JSON.stringify(q.options || []),
                q.answer || '', start, end, now(), now()
            );
            ids.push(r.lastInsertRowid);
        });
        touchReview(reviewSetId);
        return ids;
    });
}

export function updateQuestion(
    userId: number,
    reviewSetId: number,
    questionId: number,
    patch: Partial<{
        numberLabel: string;
        stem: string;
        options: { label: string; text: string }[];
        answer: string;
        type: QuestionType;
        sourceStart: number | null;
        sourceEnd: number | null;
        passageId: number | null;
    }>
): boolean {
    const owned = get<{ id: number }>('SELECT id FROM review_sets WHERE id = ? AND user_id = ? AND deleted_at IS NULL', reviewSetId, userId);
    if (!owned) return false;
    const sets: string[] = [];
    const params: unknown[] = [];
    const map: Record<string, unknown> = {
        numberLabel: patch.numberLabel,
        stem: patch.stem,
        options: patch.options ? JSON.stringify(patch.options) : undefined,
        answer: patch.answer,
        type: patch.type,
        sourceStart: patch.sourceStart,
        sourceEnd: patch.sourceEnd,
        passageId: patch.passageId
    };
    const cols: Record<string, string> = {
        numberLabel: 'number_label', stem: 'stem', options: 'options', answer: 'answer',
        type: 'type', sourceStart: 'source_start', sourceEnd: 'source_end', passageId: 'passage_id'
    };
    for (const [k, v] of Object.entries(map)) {
        if (v === undefined) continue;
        sets.push(`${cols[k]} = ?`);
        params.push(v);
    }
    if (!sets.length) return false;
    sets.push('updated_at = ?');
    params.push(now(), questionId, reviewSetId);
    run(`UPDATE questions SET ${sets.join(', ')} WHERE id = ? AND review_set_id = ?`, ...params);
    touchReview(reviewSetId);
    return true;
}

export function deleteQuestion(userId: number, reviewSetId: number, questionId: number): boolean {
    const owned = get<{ id: number }>('SELECT id FROM review_sets WHERE id = ? AND user_id = ? AND deleted_at IS NULL', reviewSetId, userId);
    if (!owned) return false;
    const r = run('DELETE FROM questions WHERE id = ? AND review_set_id = ?', questionId, reviewSetId);
    touchReview(reviewSetId);
    return r.changes > 0;
}

/** 写入单题讲评结果 */
export function saveQuestionAnalysis(
    questionId: number,
    analysis: QuestionAnalysis,
    model: string,
    source?: { start: number; end: number } | null
): void {
    run(
        'UPDATE questions SET analysis = ?, analyzed_at = ?, source_start = COALESCE(?, source_start), source_end = COALESCE(?, source_end), updated_at = ? WHERE id = ?',
        JSON.stringify({ ...analysis, analysisModel: model }), now(),
        source?.start ?? null, source?.end ?? null, now(), questionId
    );
    run('UPDATE review_sets SET status = ?, updated_at = ? WHERE id = (SELECT review_set_id FROM questions WHERE id = ?)', 'analyzed', now(), questionId);
}

/** 写入单篇原文的汇总（供讲评页底部的长难句栏使用） */
export function savePassageMeta(
    passageId: number,
    data: { summary?: string; vocabulary?: unknown[]; longSentences?: unknown[] }
): void {
    const row = get<{ meta: string }>('SELECT meta FROM passages WHERE id = ?', passageId);
    const current = parseJson<Record<string, unknown>>(row?.meta, {});
    const next = { ...current, ...data };
    run('UPDATE passages SET meta = ? WHERE id = ?', JSON.stringify(next), passageId);
}

/** 写入讲评级汇总（词汇表 / 长难句 / 概要） */
export function saveReviewSummary(
    reviewSetId: number,
    data: { summary: string; vocab: unknown[]; longSentences: unknown[]; meta?: Record<string, unknown> }
): void {
    run(
        'UPDATE review_sets SET summary = ?, vocab = ?, long_sentences = ?, meta = COALESCE(?, meta), updated_at = ? WHERE id = ?',
        data.summary, JSON.stringify(data.vocab), JSON.stringify(data.longSentences),
        data.meta ? JSON.stringify(data.meta) : null, now(), reviewSetId
    );
}

/* ---------------- 导出 / 导入 ---------------- */

export const EXPORT_VERSION = 1;

export interface ExportFile {
    format: 'zhuopu-review';
    version: number;
    exportedAt: string;
    title: string;
    kind: 'review' | 'single';
    summary: string;
    vocab: unknown[];
    longSentences: unknown[];
    passages: { label: string; content: string }[];
    questions: {
        type: QuestionType;
        numberLabel: string;
        stem: string;
        options: { label: string; text: string }[];
        answer: string;
        sourceStart: number | null;
        sourceEnd: number | null;
        passageIndex: number | null;
        analysis: unknown;
    }[];
}

export function exportReview(userId: number, id: number): ExportFile | null {
    const review = getReview(userId, id);
    if (!review) return null;
    const indexOf = new Map(review.passages.map((p, i) => [p.id, i + 1]));
    return {
        format: 'zhuopu-review',
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        title: review.title,
        kind: review.kind,
        summary: review.summary,
        vocab: review.vocab,
        longSentences: review.longSentences,
        passages: review.passages.map((p) => ({ label: p.label, content: p.content })),
        questions: review.questions.map((q) => ({
            type: q.type,
            numberLabel: q.numberLabel,
            stem: q.stem,
            options: q.options,
            answer: q.answer,
            sourceStart: q.sourceStart,
            sourceEnd: q.sourceEnd,
            passageIndex: q.passageId ? (indexOf.get(q.passageId) ?? null) : null,
            analysis: q.analysis
        }))
    };
}

/** 从导出文件导入成一个新讲评（返回新 id） */
export function importReview(userId: number, file: ExportFile, opts: { title?: string } = {}): number {
    return tx(() => {
        const created = createReview(userId, { title: opts.title || file.title || defaultTitle(), kind: file.kind === 'single' ? 'single' : 'review' });
        const passageIds = file.passages.length
            ? replacePassages(created.id, file.passages.map((p) => ({ label: p.label, content: p.content })))
            : [];
        file.questions.forEach((q, i) => {
            const passageId = q.passageIndex ? passageIds[q.passageIndex - 1] ?? null : null;
            run(
                `INSERT INTO questions (review_set_id, passage_id, ordinal, type, number_label, stem, options, answer, source_start, source_end, analysis, analyzed_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                created.id, passageId, i + 1, q.type, q.numberLabel, q.stem,
                JSON.stringify(q.options || []), q.answer, q.sourceStart, q.sourceEnd,
                JSON.stringify(q.analysis || {}), q.analysis && Object.keys(q.analysis as object).length ? now() : null,
                now(), now()
            );
        });
        saveReviewSummary(created.id, {
            summary: file.summary || '',
            vocab: file.vocab || [],
            longSentences: file.longSentences || []
        });
        logger.info(`导入讲评：用户 ${userId} 新建讲评 #${created.id}（${file.questions.length} 题）`);
        return created.id;
    });
}

/** 分享令牌 */
export function createShare(userId: number, reviewSetId: number, expiresInDays = 30): { token: string } {
    const owned = get<{ id: number }>('SELECT id FROM review_sets WHERE id = ? AND user_id = ? AND deleted_at IS NULL', reviewSetId, userId);
    if (!owned) throw Object.assign(new Error('讲评不存在'), { status: 404 });
    const token = crypto.randomBytes(16).toString('base64url');
    const expiresAt = new Date(Date.now() + expiresInDays * 86400_000);
    const p = (n: number) => String(n).padStart(2, '0');
    const ts = `${expiresAt.getFullYear()}-${p(expiresAt.getMonth() + 1)}-${p(expiresAt.getDate())} ${p(expiresAt.getHours())}:${p(expiresAt.getMinutes())}:${p(expiresAt.getSeconds())}`;
    run('INSERT INTO shares (review_set_id, token, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
        reviewSetId, token, userId, ts, now());
    return { token };
}

export function resolveShare(token: string): { reviewId: number; ownerId: number; expired: boolean } | null {
    const row = get<{ review_set_id: number; expires_at: string | null; created_by: number }>(
        'SELECT review_set_id, expires_at, created_by FROM shares WHERE token = ?', token
    );
    if (!row) return null;
    return {
        reviewId: row.review_set_id,
        ownerId: row.created_by,
        expired: !!row.expires_at && row.expires_at < now()
    };
}

export function countShares(reviewSetId: number): number {
    return get<{ c: number }>('SELECT COUNT(*) AS c FROM shares WHERE review_set_id = ?', reviewSetId)?.c ?? 0;
}
