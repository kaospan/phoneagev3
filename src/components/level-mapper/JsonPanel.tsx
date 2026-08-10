import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLevelMapper } from '@/components/level-mapper/useLevelMapper';
import { MapperMetricPill, MapperPanelFrame, MapperResizeHandle, MapperSection } from '@/components/level-mapper/MapperChrome';
import { toast } from 'sonner';

// Format grid with row number comments
const formatGridWithRowNumbers = (grid: number[][]): string => {
    if (!grid || grid.length === 0) return '[]';

    let result = '[\n';
    grid.forEach((row, index) => {
        const rowJson = JSON.stringify(row);
        const rowNumber = index + 1;
        result += `  ${rowJson}${index < grid.length - 1 ? ',' : ''} // Row ${rowNumber}\n`;
    });
    result += ']';

    return result;
};

export const JsonPanel: React.FC<{ width: number; onStartResize: () => void; min: number; max: number; resizable?: boolean; }> = ({ width, onStartResize, min, max, resizable = true }) => {
    const { grid, isSaved, jsonInput, setJsonInput, syncJsonInputToGrid, applyJsonInput } = useLevelMapper();
    const [savedGrid, setSavedGrid] = useState<number[][] | null>(null);
    const currentGridText = useMemo(() => formatGridWithRowNumbers(grid), [grid]);
    const savedGridText = useMemo(() => (savedGrid ? formatGridWithRowNumbers(savedGrid) : null), [savedGrid]);
    const currentRows = grid.length;
    const currentCols = grid[0]?.length ?? 0;
    const currentCellCount = currentRows * currentCols;
    const savedRows = savedGrid?.length ?? 0;
    const savedCols = savedGrid?.[0]?.length ?? 0;
    const savedCellCount = savedRows * savedCols;

    // Load saved grid from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('levelmapper_grid');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    setSavedGrid(parsed);
                }
            }
        } catch (err) {
            console.error('Failed to load saved grid:', err);
        }
    }, [isSaved]); // Update when save state changes

    return (
        <MapperPanelFrame
            className="shrink-0 lg:w-auto"
            style={{ width, minWidth: min, maxWidth: max }}
        >
            <div className="border-b border-white/10 px-5 py-4 pr-12">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">
                            Inspector
                        </div>
                        <div className="mt-1 text-lg font-black tracking-[0.08em] text-stone-50">
                            Grid JSON
                        </div>
                        <div className="mt-1 text-xs leading-relaxed text-stone-400">
                            Review the live map, compare it with the last saved snapshot, and apply manual JSON edits when you need precise control.
                        </div>
                    </div>
                    <div
                        className={[
                            'rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em]',
                            isSaved
                                ? 'border-emerald-300/25 bg-emerald-500/12 text-emerald-100'
                                : 'border-amber-300/25 bg-amber-500/12 text-amber-100',
                        ].join(' ')}
                    >
                        {isSaved ? 'Saved' : 'Dirty'}
                    </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <MapperMetricPill label="Current Shape" value={`${currentRows} × ${currentCols}`} />
                    <MapperMetricPill label="Current Cells" value={currentCellCount.toLocaleString()} />
                    <MapperMetricPill label="Saved Shape" value={savedGrid ? `${savedRows} × ${savedCols}` : 'None'} tone={savedGrid ? 'success' : 'default'} />
                    <MapperMetricPill label="Saved Cells" value={savedGrid ? savedCellCount.toLocaleString() : 'None'} tone={savedGrid ? 'success' : 'default'} />
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
                <MapperSection
                    title="Live Grid"
                    eyebrow="Current State"
                    description="This is the grid currently loaded in the mapper, including unsaved edits."
                    contentClassName="pt-3"
                >
                    <pre className="max-h-[28vh] overflow-auto rounded-2xl border border-white/10 bg-stone-900/85 p-3 font-mono text-[10px] leading-[1.45] text-stone-200">
                        {currentGridText}
                    </pre>
                </MapperSection>

                {savedGrid && savedGridText && (
                    <MapperSection
                        title="Saved Snapshot"
                        eyebrow="Last Save"
                        description="Use this to sanity-check what is already persisted before applying more manual edits."
                        contentClassName="pt-3"
                    >
                        <pre className="max-h-[24vh] overflow-auto rounded-2xl border border-emerald-300/15 bg-stone-900/80 p-3 font-mono text-[10px] leading-[1.45] text-stone-200">
                            {savedGridText}
                        </pre>
                    </MapperSection>
                )}

                <MapperSection
                    title="Manual JSON"
                    eyebrow="Direct Edit"
                    description="Paste a full grid array, mirror the current map into the editor, or apply your edited JSON back into the workspace."
                    contentClassName="space-y-3 pt-3"
                >
                    <Textarea
                        value={jsonInput}
                        onChange={(e) => setJsonInput(e.target.value)}
                        spellCheck={false}
                        className="min-h-[260px] rounded-2xl border-white/10 bg-stone-900/80 font-mono text-[11px] leading-5 text-stone-100"
                        placeholder="Paste a grid JSON array here"
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]"
                            onClick={async () => {
                                await navigator.clipboard.writeText(jsonInput);
                                toast.success('JSON copied to clipboard.', {
                                    position: 'bottom-right',
                                    duration: 2200,
                                });
                            }}
                        >
                            Copy JSON
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]"
                            onClick={syncJsonInputToGrid}
                        >
                            Mirror Current
                        </Button>
                        <Button
                            size="sm"
                            className="bg-sky-600 text-white hover:bg-sky-500"
                            onClick={applyJsonInput}
                        >
                            Apply JSON
                        </Button>
                    </div>
                </MapperSection>
            </div>

            {resizable ? (
                <MapperResizeHandle
                    side="left"
                    onMouseDown={onStartResize}
                    title="Resize inspector panel"
                />
            ) : null}
        </MapperPanelFrame>
    );
};

export default JsonPanel;
