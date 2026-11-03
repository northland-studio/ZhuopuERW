import { useEffect, useState } from 'react';

const KEY = 'zhuopu.fs.level';
const LEVELS = [
    { value: 1, label: '小' },
    { value: 2, label: '标准' },
    { value: 3, label: '大' },
    { value: 4, label: '特大' },
    { value: 5, label: '超大' }
];

function readLevel(): number {
    if (typeof window === 'undefined') return 2;
    const raw = Number(window.localStorage.getItem(KEY));
    return Number.isInteger(raw) && raw >= 1 && raw <= 5 ? raw : 2;
}

/** 讲评页右下角的字号调节（仅影响讲评页的原文与题目） */
export function FontSizeControl() {
    const [level, setLevel] = useState<number>(readLevel);

    useEffect(() => {
        document.documentElement.dataset.fs = String(level);
        window.localStorage.setItem(KEY, String(level));
    }, [level]);

    const current = LEVELS.find((l) => l.value === level) ?? LEVELS[1]!;

    return (
        <div className="fsctl" role="group" aria-label="正文字号">
            <button
                type="button"
                onClick={() => setLevel((v) => Math.max(1, v - 1))}
                disabled={level <= 1}
                aria-label="减小字号"
                title="减小字号"
            >
                A-
            </button>
            <span className="fsctl-val">{current.label}</span>
            <button
                type="button"
                onClick={() => setLevel((v) => Math.min(5, v + 1))}
                disabled={level >= 5}
                aria-label="增大字号"
                title="增大字号"
            >
                A+
            </button>
        </div>
    );
}
