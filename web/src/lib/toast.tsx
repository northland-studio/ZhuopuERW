import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Kind = 'info' | 'ok' | 'bad';
interface Item {
    id: number;
    text: string;
    kind: Kind;
}

const ToastContext = createContext<{ push: (text: string, kind?: Kind) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<Item[]>([]);
    const seq = useRef(0);

    const push = useCallback((text: string, kind: Kind = 'info') => {
        const id = ++seq.current;
        setItems((prev) => [...prev, { id, text, kind }]);
        window.setTimeout(() => {
            setItems((prev) => prev.filter((x) => x.id !== id));
        }, kind === 'bad' ? 4200 : 2600);
    }, []);

    const value = useMemo(() => ({ push }), [push]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="toast-wrap" role="status" aria-live="polite">
                {items.map((it) => (
                    <div key={it.id} className={`toast ${it.kind === 'bad' ? 'toast-bad' : it.kind === 'ok' ? 'toast-ok' : ''}`}>
                        {it.text}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
    return ctx;
}
