import React, { useEffect, useRef, useState } from 'react';
import { LevelMapperProvider } from '@/components/level-mapper/LevelMapperContext';
import { useLevelMapper } from '@/components/level-mapper/useLevelMapper';
import BulkAddContextMenu from '@/components/level-mapper/BulkAddContextMenu';
import LeftPanel from '@/components/level-mapper/LeftPanel';
import GridEditorPanel from '@/components/level-mapper/GridEditorPanel';
import JsonPanel from '@/components/level-mapper/JsonPanel';
import LevelLab from '@/components/level-mapper/LevelLab';
import LevelSolutionsBrowser from '@/components/level-mapper/LevelSolutionsBrowser';
import { MapperDockButton } from '@/components/level-mapper/MapperChrome';
import { ChevronLeft, ChevronRight, FlaskConical, LayoutGrid, Route } from 'lucide-react';
import { toast } from 'sonner';

const MAPPER_COMPACT_VIEWPORT_BREAKPOINT = 1280;

console.log('📦 LevelMapper.tsx loading...');

// Clean wrapper: all complex logic moved into extracted components & context.
const LayoutInner: React.FC = () => {
    console.log('⚛️ LayoutInner rendering...');
    const {
        showUnsavedBanner,
        isSaved,
        saveChanges,
        contextMenu,
        setContextMenu,
        addMultipleColumns,
        addMultipleRows,
    } = useLevelMapper();
    console.log('✓ Context loaded:', { showUnsavedBanner, isSaved });
    const unsavedToastIdRef = useRef<string | number | null>(null);
    const saveFromUnsavedToast = React.useCallback(() => {
        void (async () => {
            try {
                await saveChanges();
                toast.dismiss('level-mapper-unsaved');
            } catch (error) {
                console.error('Failed to save mapper changes from toast action:', error);
                toast.error('Failed to save mapper changes.', {
                    position: 'bottom-right',
                    duration: 4500,
                    description: error instanceof Error ? error.message : 'Unknown save error.',
                });
            }
        })();
    }, [saveChanges]);

    const defaultCompactViewport =
        typeof window !== 'undefined' ? window.innerWidth < MAPPER_COMPACT_VIEWPORT_BREAKPOINT : false;
    const [viewportWidth, setViewportWidth] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth : 1440
    );
    const isCompactViewport = viewportWidth < MAPPER_COMPACT_VIEWPORT_BREAKPOINT;
    const compactPanelWidth = Math.min(420, Math.max(280, viewportWidth - 28));

    // Local panel widths (UI only)
    const [leftPanelWidth, setLeftPanelWidth] = useState(260);
    const leftPanelMin = 228; const leftPanelMax = 640;
    const [rightPanelWidth, setRightPanelWidth] = useState(288);
    const rightPanelMin = 260; const rightPanelMax = 560;
    const isResizingLeftRef = useRef(false);
    const isResizingRightRef = useRef(false);

    // Collapse/expand state
    const [leftCollapsed, setLeftCollapsed] = useState(defaultCompactViewport);
    const [rightCollapsed, setRightCollapsed] = useState(true);
    const compactViewportRef = useRef(defaultCompactViewport);

    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize, { passive: true });
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (!compactViewportRef.current && isCompactViewport) {
            setLeftCollapsed(true);
            setRightCollapsed(true);
        }
        compactViewportRef.current = isCompactViewport;
    }, [isCompactViewport]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (isResizingLeftRef.current) {
                let newW = e.clientX - 32;
                newW = Math.max(leftPanelMin, Math.min(leftPanelMax, newW));
                setLeftPanelWidth(newW);
            }
            if (isResizingRightRef.current) {
                const newW = window.innerWidth - e.clientX - 32;
                setRightPanelWidth(Math.max(rightPanelMin, Math.min(rightPanelMax, newW)));
            }
        };
        const onUp = () => { isResizingLeftRef.current = false; isResizingRightRef.current = false; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [leftPanelMin, leftPanelMax, rightPanelMin, rightPanelMax]);

    useEffect(() => {
        if (!isSaved && showUnsavedBanner) {
            const toastId = 'level-mapper-unsaved';
            unsavedToastIdRef.current = toast.warning('You have unsaved changes', {
                id: toastId,
                position: 'bottom-right',
                duration: 4500,
                description: 'Save the current mapper layout and grid changes when ready.',
                action: {
                    label: 'Save',
                    onClick: saveFromUnsavedToast,
                },
            });
            return;
        }

        if (isSaved && unsavedToastIdRef.current !== null) {
            toast.dismiss(unsavedToastIdRef.current);
            unsavedToastIdRef.current = null;
        }
    }, [isSaved, saveFromUnsavedToast, showUnsavedBanner]);

    const showCompactDockBar = isCompactViewport && leftCollapsed && rightCollapsed;

    const [mapperMode, setMapperMode] = useState<'editor' | 'solutions' | 'lab'>('editor');

    return (
        <div className="relative h-full min-h-0 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_26%),linear-gradient(180deg,#1c1917_0%,#0c0a09_100%)] text-stone-100">
            <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
            <div className="relative mx-auto flex h-full min-h-0 w-full max-w-[1880px] flex-col gap-1.5 p-1.5 sm:gap-2 sm:p-2">
                <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                    <div className="flex shrink-0 items-center gap-1.5 px-1">
                        <button
                            type="button"
                            onClick={() => setMapperMode('editor')}
                            className={[
                                'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] transition-colors',
                                mapperMode === 'editor'
                                    ? 'border-amber-300/40 bg-amber-500/15 text-amber-100'
                                    : 'border-white/10 bg-white/[0.04] text-stone-400 hover:text-stone-100',
                            ].join(' ')}
                        >
                            <LayoutGrid className="h-3.5 w-3.5" />
                            Editor
                        </button>
                        <button
                            type="button"
                            onClick={() => setMapperMode('solutions')}
                            className={[
                                'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] transition-colors',
                                mapperMode === 'solutions'
                                    ? 'border-amber-300/40 bg-amber-500/15 text-amber-100'
                                    : 'border-white/10 bg-white/[0.04] text-stone-400 hover:text-stone-100',
                            ].join(' ')}
                            title="Preview every level's map top-down and step through its solved playthrough"
                        >
                            <Route className="h-3.5 w-3.5" />
                            Solutions
                        </button>
                        <button
                            type="button"
                            onClick={() => setMapperMode('lab')}
                            className={[
                                'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] transition-colors',
                                mapperMode === 'lab'
                                    ? 'border-amber-300/40 bg-amber-500/15 text-amber-100'
                                    : 'border-white/10 bg-white/[0.04] text-stone-400 hover:text-stone-100',
                            ].join(' ')}
                            title="Generate solver-checked level candidates and keep the best drafts"
                        >
                            <FlaskConical className="h-3.5 w-3.5" />
                            Lab
                        </button>
                    </div>

                    <div
                        className="min-h-0 flex-1"
                        style={{ display: mapperMode === 'solutions' ? 'flex' : 'none' }}
                    >
                        <LevelSolutionsBrowser />
                    </div>

                    <div
                        className="min-h-0 flex-1"
                        style={{ display: mapperMode === 'lab' ? 'flex' : 'none' }}
                    >
                        <LevelLab />
                    </div>

                    <div
                        className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden"
                        style={{ display: mapperMode === 'editor' ? 'flex' : 'none' }}
                    >
                    {showCompactDockBar && (
                        <div className="flex shrink-0 items-center gap-2 px-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setRightCollapsed(true);
                                    setLeftCollapsed(false);
                                }}
                                className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-stone-950/92 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-stone-100 shadow-lg backdrop-blur-xl transition-colors hover:border-amber-200/30"
                            >
                                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                Controls
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setLeftCollapsed(true);
                                    setRightCollapsed(false);
                                }}
                                className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-stone-950/92 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-stone-100 shadow-lg backdrop-blur-xl transition-colors hover:border-sky-200/30"
                            >
                                Inspector
                                <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                            </button>
                        </div>
                    )}

                    <div className="relative flex min-h-0 flex-1 gap-3 overflow-hidden">
                        {!isCompactViewport && !leftCollapsed ? (
                            <div className="relative flex h-full min-h-0 shrink-0 transition-all duration-300">
                                <LeftPanel width={leftPanelWidth} onStartResize={() => { isResizingLeftRef.current = true; }} min={leftPanelMin} max={leftPanelMax} />
                                <button
                                    onClick={() => setLeftCollapsed(true)}
                                    className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-stone-950/85 text-stone-300 shadow-lg transition-colors hover:border-amber-200/30 hover:text-stone-50"
                                    title="Collapse control deck"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                            </div>
                        ) : !isCompactViewport ? (
                            <MapperDockButton
                                title="Controls"
                                description="Re-open the level, screenshot, and tile workflow deck."
                                onClick={() => setLeftCollapsed(false)}
                                icon={<ChevronRight className="h-4 w-4" />}
                                align="left"
                            />
                        ) : null}

                        <GridEditorPanel />

                        {!isCompactViewport && !rightCollapsed ? (
                            <div className="relative flex h-full min-h-0 shrink-0 transition-all duration-300">
                                <JsonPanel width={rightPanelWidth} onStartResize={() => { isResizingRightRef.current = true; }} min={rightPanelMin} max={rightPanelMax} />
                                <button
                                    onClick={() => setRightCollapsed(true)}
                                    className="absolute left-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-stone-950/85 text-stone-300 shadow-lg transition-colors hover:border-sky-200/30 hover:text-stone-50"
                                    title="Collapse inspector"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        ) : !isCompactViewport ? (
                            <MapperDockButton
                                title="Inspector"
                                description="Bring back the JSON, current grid, and saved snapshot view."
                                onClick={() => setRightCollapsed(false)}
                                icon={<ChevronLeft className="h-4 w-4" />}
                                align="right"
                            />
                        ) : null}

                        {isCompactViewport && !leftCollapsed && (
                            <>
                                <button
                                    type="button"
                                    className="absolute inset-0 z-30 bg-black/45 backdrop-blur-[1px]"
                                    onClick={() => setLeftCollapsed(true)}
                                    aria-label="Close control deck"
                                />
                                <div className="absolute inset-y-0 left-0 z-40 w-full max-w-[min(92vw,420px)] pr-2 sm:pr-3">
                                    <div className="relative h-full min-h-0">
                                        <LeftPanel
                                            width={compactPanelWidth}
                                            onStartResize={() => { /* compact overlay is fixed width */ }}
                                            min={compactPanelWidth}
                                            max={compactPanelWidth}
                                            resizable={false}
                                        />
                                        <button
                                            onClick={() => setLeftCollapsed(true)}
                                            className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-stone-950/85 text-stone-300 shadow-lg transition-colors hover:border-amber-200/30 hover:text-stone-50"
                                            title="Close control deck"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {isCompactViewport && !rightCollapsed && (
                            <>
                                <button
                                    type="button"
                                    className="absolute inset-0 z-30 bg-black/45 backdrop-blur-[1px]"
                                    onClick={() => setRightCollapsed(true)}
                                    aria-label="Close inspector"
                                />
                                <div className="absolute inset-y-0 right-0 z-40 w-full max-w-[min(92vw,420px)] pl-2 sm:pl-3">
                                    <div className="relative h-full min-h-0">
                                        <JsonPanel
                                            width={compactPanelWidth}
                                            onStartResize={() => { /* compact overlay is fixed width */ }}
                                            min={compactPanelWidth}
                                            max={compactPanelWidth}
                                            resizable={false}
                                        />
                                        <button
                                            onClick={() => setRightCollapsed(true)}
                                            className="absolute left-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-stone-950/85 text-stone-300 shadow-lg transition-colors hover:border-sky-200/30 hover:text-stone-50"
                                            title="Close inspector"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    </div>
                </div>
            </div>
            <BulkAddContextMenu
                menu={contextMenu}
                onAdd={(type, count) => {
                    if (type === 'column-left') addMultipleColumns('left', count);
                    else if (type === 'column-right') addMultipleColumns('right', count);
                    else if (type === 'row-top') addMultipleRows('top', count);
                    else if (type === 'row-bottom') addMultipleRows('bottom', count);
                    setContextMenu(null);
                }}
                onClose={() => setContextMenu(null)}
            />
        </div>
    );
};

console.log('✅ LevelMapper.tsx loaded');

export const LevelMapper: React.FC = () => {
    console.log('⚛️ LevelMapper mounting...');
    return (
        <LevelMapperProvider>
            <LayoutInner />
        </LevelMapperProvider>
    );
};

export default LevelMapper;
