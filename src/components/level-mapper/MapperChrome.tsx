import React from 'react';
import { GripVertical } from 'lucide-react';

import { cn } from '@/lib/utils';

export const MapperPanelFrame: React.FC<{
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}> = ({ children, className, style }) => (
    <div
        className={cn(
            'relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-stone-950/88 text-stone-100 shadow-[0_18px_54px_rgba(0,0,0,0.3)] backdrop-blur-xl',
            className,
        )}
        style={style}
    >
        {children}
    </div>
);

export const MapperSection: React.FC<{
    title: string;
    eyebrow?: string;
    description?: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
}> = ({ title, eyebrow, description, actions, children, className, contentClassName }) => (
    <section className={cn('rounded-2xl border border-white/10 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]', className)}>
        <div className="flex items-start justify-between gap-2 border-b border-white/10 px-3 py-2">
            <div className="min-w-0">
                {eyebrow && (
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">
                        {eyebrow}
                    </div>
                )}
                <div className="mt-0.5 text-sm font-semibold text-stone-50">{title}</div>
                {description && (
                    <div className="mt-0.5 text-xs leading-snug text-stone-400">{description}</div>
                )}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        <div className={cn('px-3 py-3', contentClassName)}>{children}</div>
    </section>
);

export const MapperMetricPill: React.FC<{
    label: string;
    value: React.ReactNode;
    tone?: 'default' | 'success' | 'warning' | 'info';
    className?: string;
}> = ({ label, value, tone = 'default', className }) => {
    const toneClassName =
        tone === 'success'
            ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100'
            : tone === 'warning'
                ? 'border-amber-300/30 bg-amber-500/10 text-amber-100'
                : tone === 'info'
                    ? 'border-sky-300/30 bg-sky-500/10 text-sky-100'
                    : 'border-white/10 bg-white/[0.05] text-stone-100';

    return (
        <div className={cn('rounded-xl border px-2.5 py-1.5', toneClassName, className)}>
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-stone-400">{label}</div>
            <div className="mt-0.5 text-sm font-semibold leading-tight">{value}</div>
        </div>
    );
};

export const MapperResizeHandle: React.FC<{
    side: 'left' | 'right';
    onMouseDown: () => void;
    title?: string;
}> = ({ side, onMouseDown, title = 'Resize panel' }) => (
    <div
        className={cn(
            'absolute top-0 z-10 flex h-full w-5 cursor-ew-resize items-center justify-center',
            side === 'left' ? '-left-2.5' : '-right-2.5',
        )}
        onMouseDown={onMouseDown}
        title={title}
    >
        <div className="flex h-16 w-2 items-center justify-center rounded-full border border-white/10 bg-stone-900/90 text-stone-500 shadow-sm transition-colors hover:text-stone-200">
            <GripVertical className="h-3.5 w-3.5 rotate-90" />
        </div>
    </div>
);

export const MapperDockButton: React.FC<{
    title: string;
    description: string;
    onClick: () => void;
    icon: React.ReactNode;
    align?: 'left' | 'right';
}> = ({ title, description, onClick, icon, align = 'left' }) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            'flex w-12 shrink-0 flex-col items-center gap-2 rounded-2xl border border-white/10 bg-stone-950/88 px-1.5 py-3 text-center text-stone-100 shadow-[0_16px_44px_rgba(0,0,0,0.26)] backdrop-blur-xl transition-all hover:border-amber-200/30 hover:bg-stone-900/92',
            align === 'right' && 'items-end text-right',
        )}
        title={`${title}: ${description}`}
    >
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-stone-200">
            {icon}
        </div>
        <div className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">
            {title}
        </div>
        <span className="sr-only">{description}</span>
    </button>
);
