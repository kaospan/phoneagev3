import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TILE_TYPES, voidGrid } from '@/lib/levelgrid';
import { useLevelMapper } from '@/components/level-mapper/useLevelMapper';
import { themes, type ColorTheme, type Level } from '@/data/levels';
import { normalizeMapperImage } from './imageNormalization';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { guessThemeForLevelId, saveCustomLevelDefinition } from '@/lib/customLevels';
import { putLevelImage } from './levelImageStore';
import { resolveLevelMapperBaseline } from './levelBaseline';
import { DEFAULT_MAPPER_COLS, DEFAULT_MAPPER_ROWS, createDefaultMapperVoidGrid } from './mapperDefaults';
import { MapperPanelFrame, MapperResizeHandle, MapperSection } from './MapperChrome';
import { getAdminMode, setAdminMode } from '@/lib/adminMode';
import { getRecordMovesEnabled, setRecordMovesEnabled } from '@/lib/moveRecording';
import {
    VIEW_MODES,
    type ViewMode,
    DISABLED_VIEW_MODES_UPDATED_EVENT,
    getDisabledViewModes,
    setViewModeSkipped,
    subscribeToDisabledViewModes,
} from '@/lib/viewModePrefs';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

const VIEW_MODE_TOGGLE_LABELS: Record<ViewMode, string> = {
    '3d': '3D',
    fps: 'FPS',
    '2d': '2D',
    sprite: 'SPR',
    top: 'TOP',
};

const fitGridToShape = (source: number[][], nextRows: number, nextCols: number, fill = 5) => {
    const out = Array.from({ length: nextRows }, () => Array(nextCols).fill(fill));
    const rowMax = Math.min(source.length, nextRows);
    const colMax = Math.min(source[0]?.length ?? 0, nextCols);
    for (let r = 0; r < rowMax; r += 1) {
        for (let c = 0; c < colMax; c += 1) {
            out[r][c] = source[r][c];
        }
    }
    return out;
};

export const LeftPanel: React.FC<{ width: number; onStartResize: () => void; min: number; max: number; resizable?: boolean; }> = ({ width, onStartResize, min, max, resizable = true }) => {
    const {
        rows, cols, setRows, setCols,
        importLevelIndex, setImportLevelIndex,
        compareLevelIndex, setCompareLevelIndex,
        overlayEnabled, setOverlayEnabled, setOverlayOpacity, setOverlayStretch,
        allLevels, imageURL, setImageURL,
        setAllLevels,
        detectGrid,
        zoom, setZoom, gridOffsetX, setGridOffsetX, gridOffsetY, setGridOffsetY,
        gridFrameWidth, setGridFrameWidth, gridFrameHeight, setGridFrameHeight,
        imageScaleX, setImageScaleX, imageScaleY, setImageScaleY, imageOffsetX, setImageOffsetX, imageOffsetY, setImageOffsetY, lockImageAspect, setLockImageAspect,
        activeTile, setGrid, grid, setPlayerStart,
        hourglassBrushSeconds, setHourglassBrushSeconds, setHourglassBonusByCell,
        theme, setTheme, timeLimitSeconds, setTimeLimitSeconds, hud3d, setHud3d, setIsSaved,
        setLoadedSnapshot, replaceGridShape
    } = useLevelMapper();

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [isDetecting, setIsDetecting] = useState(false);
    const [detectionProgress, setDetectionProgress] = useState<string>('');

    // Upload flow: choose an image, then decide which level id to apply it to.
    const [applyDialogOpen, setApplyDialogOpen] = useState(false);
    const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
    const [pendingUploadLevelId, setPendingUploadLevelId] = useState<string>('');
    const [pendingUploadAllowOverwrite, setPendingUploadAllowOverwrite] = useState(false);
    const [pendingUploadError, setPendingUploadError] = useState<string>('');
    const [adminModeEnabled, setAdminModeEnabled] = useState(() => getAdminMode());
    const [recordMovesOn, setRecordMovesOn] = useState(() => getRecordMovesEnabled());
    const [disabledViewModes, setDisabledViewModes] = useState<Set<ViewMode>>(() => new Set(getDisabledViewModes()));
    useEffect(() => {
        const refresh = () => setDisabledViewModes(new Set(getDisabledViewModes()));
        window.addEventListener(DISABLED_VIEW_MODES_UPDATED_EVENT, refresh);
        const unsubscribe = subscribeToDisabledViewModes();
        return () => {
            window.removeEventListener(DISABLED_VIEW_MODES_UPDATED_EVENT, refresh);
            unsubscribe();
        };
    }, []);

    const currentLevel = importLevelIndex !== null ? allLevels[importLevelIndex] ?? null : null;
    const currentLevelTitle = currentLevel ? `Level ${currentLevel.id}` : 'Level Mapper';
    const selectedTile = TILE_TYPES.find((tile) => tile.id === activeTile) ?? TILE_TYPES[0];
    const currentThemeKey = theme || 'default';
    const themePreview = themes[currentThemeKey]?.floor ?? themes.default.floor;
    const canGoPrev = importLevelIndex !== null && importLevelIndex > 0;
    const canGoNext = importLevelIndex !== null && importLevelIndex < allLevels.length - 1;
    const boardShapeLabel = `${rows} × ${cols}`;
    const imageStatusLabel = imageURL ? (overlayEnabled ? 'Overlay Active' : 'Image Loaded') : 'No Image';
    const setHud3dOption = (key: keyof typeof hud3d, checked: boolean) => {
        setHud3d((prev) => ({ ...prev, [key]: checked }));
        setIsSaved(false);
    };
    const triggerFileUpload = () => fileInputRef.current?.click();

    // Expose a console helper for exporting current calibrations as a factory-defaults snippet.
    useEffect(() => {
        const w = window as Window & typeof globalThis & { __mapperExportCalibrations?: () => void };
        w.__mapperExportCalibrations = () => {
            const entries: Record<number, { imageScaleX: number; imageScaleY: number }> = {};
            for (let id = 1; id <= 200; id++) {
                const raw = localStorage.getItem(`level_mapper_image_scale_${id}`);
                if (raw) {
                    try {
                        const p = JSON.parse(raw) as { x?: number; y?: number; v?: number; baseY?: number };
                        if (p && typeof p.y === 'number' && Math.abs(p.y - 1) > 0.005) {
                            entries[id] = { imageScaleX: p.x ?? 1, imageScaleY: p.y };
                        }
                    } catch { /* ignore */ }
                }
            }
            const lines = Object.entries(entries).map(([id, cal]) =>
                `  ${id}: { imageScaleX: ${cal.imageScaleX}, imageScaleY: ${cal.imageScaleY} },`
            ).join('\n');
            const snippet = `// Paste into MAPPER_FACTORY_CALIBRATIONS in src/data/mapperFactoryDefaults.ts:\n${lines || '  // (no non-default calibrations found)'}`;
            console.log(snippet);
            try { navigator.clipboard.writeText(snippet); console.log('✅ Copied to clipboard'); } catch { /* ignore */ }
        };
        return () => { delete w.__mapperExportCalibrations; };
    }, []);

    const runCellDetection = async () => {
        try {
            setIsDetecting(true);
            setDetectionProgress('Snapping grid to floor tiles...');
            await new Promise((resolve) => setTimeout(resolve, 50));
            await detectGrid();
        } catch (error) {
            console.error('❌ Error running image cell detection:', error);
            alert(`Auto-detect failed: ${(error as Error).message}`);
        } finally {
            setIsDetecting(false);
            setDetectionProgress('');
        }
    };

    const loadLevelByIndex = async (idx: number) => {
        const lvl = allLevels[idx];
        if (!lvl?.grid) return;

        const baseline = await resolveLevelMapperBaseline(lvl);
        const targetRows = Math.max(1, rows || DEFAULT_MAPPER_ROWS);
        const targetCols = Math.max(1, cols || DEFAULT_MAPPER_COLS);
        const fittedGrid = fitGridToShape(baseline.grid, targetRows, targetCols, 5);
        const fittedPlayerStart = baseline.playerStart
            ? {
                x: Math.min(Math.max(0, baseline.playerStart.x), targetCols - 1),
                y: Math.min(Math.max(0, baseline.playerStart.y), targetRows - 1),
            }
            : null;

        // Keep board size stable across levels unless the user manually changes rows/cols.
        setRows(targetRows);
        setCols(targetCols);
        setGrid(fittedGrid);
        setHourglassBonusByCell({ ...(baseline.hourglassBonusByCell ?? {}) });
        setImageURL(baseline.imageURL);
        setOverlayEnabled(baseline.overlayEnabled);
        setOverlayOpacity(baseline.overlayOpacity);
        setOverlayStretch(baseline.overlayStretch);
        setGridOffsetX(baseline.gridOffsetX);
        setGridOffsetY(baseline.gridOffsetY);
        setGridFrameWidth(baseline.gridFrameWidth);
        setGridFrameHeight(baseline.gridFrameHeight);
        setZoom(baseline.zoom);
        setImageScaleX(baseline.imageScaleX);
        setImageScaleY(baseline.imageScaleY);
        setImageOffsetX(baseline.imageOffsetX);
        setImageOffsetY(baseline.imageOffsetY);
        setLockImageAspect(baseline.lockImageAspect);
        setPlayerStart(fittedPlayerStart);
        setTheme(baseline.theme);
        setTimeLimitSeconds(baseline.timeLimitSeconds);

        setLoadedSnapshot({
            levelId: baseline.levelId,
            grid: fittedGrid,
            playerStart: fittedPlayerStart,
            provenance: baseline.provenance,
            theme: baseline.theme,
            timeLimitSeconds: baseline.timeLimitSeconds,
            hourglassBonusByCell: baseline.hourglassBonusByCell,
            imageURL: baseline.imageURL,
            overlayEnabled: baseline.overlayEnabled,
            overlayOpacity: baseline.overlayOpacity,
            overlayStretch: baseline.overlayStretch,
            imageScaleX: baseline.imageScaleX,
            imageScaleY: baseline.imageScaleY,
            imageOffsetX: baseline.imageOffsetX,
            imageOffsetY: baseline.imageOffsetY,
            lockImageAspect: baseline.lockImageAspect,
            zoom: baseline.zoom,
            gridOffsetX: baseline.gridOffsetX,
            gridOffsetY: baseline.gridOffsetY,
            gridFrameWidth: baseline.gridFrameWidth,
            gridFrameHeight: baseline.gridFrameHeight,
        });
    };

    return (
        <MapperPanelFrame
            className="shrink-0 lg:w-auto"
            style={{ width, minWidth: min, maxWidth: max, maxHeight: '100%' }}
        >
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent)] px-4 py-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                        try {
                            console.log('📁 File input onChange triggered');
                            const f = e.target.files?.[0];
                            if (!f) {
                                console.log('❌ No file selected');
                                return;
                            }

                            console.log('📷 File selected:', f.name, f.type, f.size, 'bytes');

                            const levelMatch = f.name.match(/^(\\d{1,3})\\D|(?:lvl|level)[\\s_-]*(\\d{1,3})/i);
                            const raw = levelMatch?.[1] ?? levelMatch?.[2];
                            const fromName = raw ? parseInt(raw, 10) : null;
                            const currentId = importLevelIndex !== null ? allLevels[importLevelIndex]?.id ?? null : null;
                            const maxId = allLevels.reduce((m, l) => Math.max(m, l.id), 0);
                            const suggested = fromName ?? currentId ?? (maxId + 1);

                            setPendingUploadFile(f);
                            setPendingUploadLevelId(String(suggested));
                            setPendingUploadAllowOverwrite(false);
                            setPendingUploadError('');
                            setApplyDialogOpen(true);

                            try { e.currentTarget.value = ''; } catch { /* ignore */ }
                        } catch (error) {
                            console.error('❌ Error in file onChange handler:', error);
                            console.error('Stack trace:', (error as Error).stack);
                            setIsDetecting(false);
                            setDetectionProgress('');
                            alert(`Failed to load image: ${(error as Error).message}`);
                        }
                    }}
                />

                <div className="flex flex-wrap items-center gap-2 pr-10">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-white/10 bg-white/[0.03] px-2.5 text-xs text-stone-100 hover:bg-white/[0.08]"
                        onClick={() => {
                            replaceGridShape(createDefaultMapperVoidGrid());
                            setImageURL(null);
                            setHourglassBonusByCell({});
                            setPlayerStart(null);
                            setGridOffsetX(0);
                            setGridOffsetY(0);
                            setGridFrameWidth(null);
                            setGridFrameHeight(null);
                            localStorage.removeItem('levelmapper-import-level');
                            localStorage.removeItem('levelmapper_playerStart');
                            setImportLevelIndex(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        title="Clear current level and start fresh"
                    >
                        New
                    </Button>
                    <select
                        className="h-8 min-w-[132px] flex-1 rounded-xl border border-white/10 bg-stone-900/85 px-2.5 text-xs text-stone-100 [color-scheme:dark]"
                        value={importLevelIndex ?? ''}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') return;
                            const idx = parseInt(val, 10);
                            setImportLevelIndex(idx);
                            setCompareLevelIndex(idx);
                            void loadLevelByIndex(idx);
                        }}
                        title="Load an existing level into the mapper"
                        aria-label={currentLevelTitle}
                    >
                        <option value="">Load level...</option>
                        {allLevels.map((lvl, idx) => (<option key={lvl.id} value={idx}>Level {lvl.id}</option>))}
                    </select>
                    <Button
                        size="sm"
                        className="h-8 bg-amber-300 px-2.5 text-xs text-stone-950 hover:bg-amber-200"
                        onClick={triggerFileUpload}
                    >
                        Upload
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-white/10 bg-white/[0.03] px-2.5 text-xs text-stone-100 hover:bg-white/[0.08]"
                        disabled={!canGoPrev}
                        title={importLevelIndex === null ? 'Load a level first' : 'Load previous level'}
                        onClick={() => {
                            if (importLevelIndex === null) return;
                            const nextIdx = Math.max(0, importLevelIndex - 1);
                            setImportLevelIndex(nextIdx);
                            setCompareLevelIndex(nextIdx);
                            void loadLevelByIndex(nextIdx);
                        }}
                    >
                        Prev
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-white/10 bg-white/[0.03] px-2.5 text-xs text-stone-100 hover:bg-white/[0.08]"
                        disabled={!canGoNext}
                        title={importLevelIndex === null ? 'Load a level first' : 'Load next level'}
                        onClick={() => {
                            if (importLevelIndex === null) return;
                            const nextIdx = Math.min(allLevels.length - 1, importLevelIndex + 1);
                            setImportLevelIndex(nextIdx);
                            setCompareLevelIndex(nextIdx);
                            void loadLevelByIndex(nextIdx);
                        }}
                    >
                        Next
                    </Button>
                    <button
                        type="button"
                        onClick={() => {
                            const next = !adminModeEnabled;
                            setAdminModeEnabled(next);
                            setAdminMode(next);
                            toast.success(`Admin mode ${next ? 'enabled' : 'disabled'}.`, {
                                position: 'bottom-right',
                                duration: 2200,
                            });
                        }}
                        className={[
                            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border px-2 text-[10px] font-black uppercase tracking-[0.12em] transition-colors',
                            adminModeEnabled
                                ? 'border-emerald-300/30 bg-emerald-500/15 text-emerald-100'
                                : 'border-white/10 bg-white/[0.06] text-stone-300 hover:border-amber-200/30 hover:text-stone-50',
                        ].join(' ')}
                        title="Verified admin accounts can always skip/preview all levels in the main game. This toggle only controls forcing rebuilds/saves over canonical level data here in the mapper."
                        aria-pressed={adminModeEnabled}
                    >
                        <span>Admin</span>
                        <span
                            className={[
                                'inline-flex min-w-8 items-center justify-center rounded-full border px-1.5 py-0.5 text-[9px]',
                                adminModeEnabled
                                    ? 'border-emerald-200/40 bg-emerald-400/25 text-emerald-50'
                                    : 'border-stone-500/40 bg-stone-700/40 text-stone-200',
                            ].join(' ')}
                        >
                            {adminModeEnabled ? 'ON' : 'OFF'}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const next = !recordMovesOn;
                            setRecordMovesOn(next);
                            setRecordMovesEnabled(next);
                            toast.success(`Move recording ${next ? 'enabled' : 'disabled'}.`, {
                                position: 'bottom-right',
                                duration: 2200,
                            });
                        }}
                        className={[
                            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border px-2 text-[10px] font-black uppercase tracking-[0.12em] transition-colors',
                            recordMovesOn
                                ? 'border-red-300/30 bg-red-500/15 text-red-100'
                                : 'border-white/10 bg-white/[0.06] text-stone-300 hover:border-amber-200/30 hover:text-stone-50',
                        ].join(' ')}
                        title="When enabled, playing a level in the main game records your moves, viewable as a replay on completion — to assist the solver."
                        aria-pressed={recordMovesOn}
                    >
                        <span>Record</span>
                        <span
                            className={[
                                'inline-flex min-w-8 items-center justify-center rounded-full border px-1.5 py-0.5 text-[9px]',
                                recordMovesOn
                                    ? 'border-red-200/40 bg-red-400/25 text-red-50'
                                    : 'border-stone-500/40 bg-stone-700/40 text-stone-200',
                            ].join(' ')}
                        >
                            {recordMovesOn ? 'ON' : 'OFF'}
                        </span>
                    </button>
                    <a
                        href={`${import.meta.env.BASE_URL ?? '/'}crm`}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-2 text-[10px] font-black uppercase tracking-[0.12em] text-stone-300 transition-colors hover:border-amber-200/30 hover:text-stone-50"
                        title="Open the player CRM — who's online, levels played, moves, attempts"
                    >
                        CRM
                    </a>
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className={[
                                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border px-2 text-[10px] font-black uppercase tracking-[0.12em] transition-colors',
                                    disabledViewModes.size > 0
                                        ? 'border-emerald-300/30 bg-emerald-500/15 text-emerald-100'
                                        : 'border-white/10 bg-white/[0.06] text-stone-300 hover:border-amber-200/30 hover:text-stone-50',
                                ].join(' ')}
                                title="Choose which camera modes the main game's view-cycle button skips."
                                aria-pressed={disabledViewModes.size > 0}
                            >
                                <span>View Modes</span>
                                <span
                                    className={[
                                        'inline-flex min-w-8 items-center justify-center rounded-full border px-1.5 py-0.5 text-[9px]',
                                        disabledViewModes.size > 0
                                            ? 'border-emerald-200/40 bg-emerald-400/25 text-emerald-50'
                                            : 'border-stone-500/40 bg-stone-700/40 text-stone-200',
                                    ].join(' ')}
                                >
                                    {disabledViewModes.size > 0 ? `${disabledViewModes.size} SKIPPED` : 'ALL ON'}
                                </span>
                            </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-56">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                Camera modes to cycle
                            </div>
                            <div className="space-y-2">
                                {VIEW_MODES.map((mode) => {
                                    const checked = !disabledViewModes.has(mode);
                                    const inputId = `mapper-view-mode-toggle-${mode}`;
                                    return (
                                        <label key={mode} htmlFor={inputId} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <Checkbox
                                                id={inputId}
                                                checked={checked}
                                                onCheckedChange={(value) => {
                                                    const skip = value === false;
                                                    // Optimistic — reverted below if the write doesn't actually
                                                    // persist (e.g. this account lost admin status mid-session).
                                                    setDisabledViewModes((prev) => {
                                                        const next = new Set(prev);
                                                        if (skip) next.add(mode);
                                                        else next.delete(mode);
                                                        return next;
                                                    });
                                                    void setViewModeSkipped(mode, skip).then((ok) => {
                                                        if (ok) {
                                                            toast.success(`${VIEW_MODE_TOGGLE_LABELS[mode]} ${skip ? 'removed from' : 'restored to'} the game's view rotation for every player.`, {
                                                                position: 'bottom-right',
                                                                duration: 2200,
                                                            });
                                                        } else {
                                                            setDisabledViewModes((prev) => {
                                                                const next = new Set(prev);
                                                                if (skip) next.delete(mode);
                                                                else next.add(mode);
                                                                return next;
                                                            });
                                                            toast.error(`Couldn't update ${VIEW_MODE_TOGGLE_LABELS[mode]} — try again.`, {
                                                                position: 'bottom-right',
                                                                duration: 2600,
                                                            });
                                                        }
                                                    });
                                                }}
                                            />
                                            {VIEW_MODE_TOGGLE_LABELS[mode]}
                                        </label>
                                    );
                                })}
                            </div>
                            <div className="mt-2 text-[11px] text-muted-foreground">
                                Unchecked modes are skipped by the view-cycle button. At least one mode always stays available.
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-300">
                    <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">Board {boardShapeLabel}</span>
                    <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">Theme {currentThemeKey === 'default' ? 'Default' : currentThemeKey}</span>
                    <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">{selectedTile.name}</span>
                    <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">{imageStatusLabel}</span>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[1.1fr,0.9fr]">
                    <div className="rounded-[20px] border border-white/10 bg-white/[0.045] px-4 py-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Theme + Timer</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr,auto]">
                            <div className="flex items-center gap-2">
                                <select
                                    className="h-10 min-w-[120px] flex-1 rounded-2xl border border-white/10 bg-stone-900/85 px-3 text-sm text-stone-100 [color-scheme:dark]"
                                    value={currentThemeKey}
                                    onChange={(e) => {
                                        const newTheme = e.target.value === 'default' ? undefined : e.target.value as ColorTheme;
                                        setTheme(newTheme);
                                        setIsSaved(false);
                                    }}
                                >
                                    <option value="default">Default (Brown)</option>
                                    <option value="ocean">Ocean (Blue)</option>
                                    <option value="forest">Forest (Green)</option>
                                    <option value="sunset">Sunset (Orange/Pink)</option>
                                    <option value="lava">Lava (Red)</option>
                                    <option value="crystal">Crystal (Purple)</option>
                                    <option value="neon">Neon (Cyberpunk)</option>
                                    <option value="snow">Snow (White)</option>
                                    <option value="gray">Gray (Neutral)</option>
                                    <option value="slate">Slate (Cool Gray)</option>
                                </select>
                                <div
                                    className="h-10 w-10 shrink-0 rounded-2xl border border-white/10 shadow-sm"
                                    style={{ backgroundColor: themePreview }}
                                    title={`${currentThemeKey} theme preview`}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    className="h-10 w-24 rounded-2xl border border-white/10 bg-stone-900/85 px-3 text-sm text-stone-100 [color-scheme:dark]"
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    step={1}
                                    placeholder="0"
                                    value={timeLimitSeconds ?? ''}
                                    onChange={(e) => {
                                        const raw = e.target.value;
                                        if (raw === '') {
                                            setTimeLimitSeconds(null);
                                            setIsSaved(false);
                                            return;
                                        }
                                        const n = Math.max(0, Math.round(Number(raw)));
                                        setTimeLimitSeconds(n > 0 ? n : null);
                                        setIsSaved(false);
                                    }}
                                    title="Seconds countdown per level (0 disables)"
                                />
                                <div className="text-[11px] text-stone-400">sec</div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[20px] border border-white/10 bg-white/[0.045] px-4 py-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">3D HUD Status Bar</div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-200">
                            {[
                                ['showTimer', 'Timer'],
                                ['showMoves', 'Moves'],
                                ['showRedKeys', 'Red keys'],
                                ['showGreenKeys', 'Green keys'],
                            ].map(([key, label]) => (
                                <label key={key} className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-stone-900/45 px-2.5 py-2">
                                    <Checkbox
                                        checked={hud3d[key as keyof typeof hud3d]}
                                        onCheckedChange={(checked) => setHud3dOption(key as keyof typeof hud3d, checked === true)}
                                    />
                                    <span>{label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                </div>
            </div>

            <Dialog
                open={applyDialogOpen}
                onOpenChange={(open) => {
                    setApplyDialogOpen(open);
                    if (!open) setPendingUploadError('');
                }}
            >
                <DialogContent className="max-w-md border-white/10 bg-stone-950/95 text-stone-100">
                    <DialogHeader>
                        <DialogTitle className="text-stone-50">Apply Screenshot To Level</DialogTitle>
                        <DialogDescription className="text-stone-400">
                            Choose which level number this image belongs to. By default this will not overwrite an existing saved screenshot.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="text-xs text-stone-400">
                            File: <span className="font-medium text-stone-100">{pendingUploadFile?.name ?? 'None'}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="text-sm whitespace-nowrap text-stone-300">Level #</label>
                            <input
                                className="w-28 rounded-2xl border border-white/10 bg-stone-900/85 px-3 py-2 text-stone-100 [color-scheme:dark]"
                                inputMode="numeric"
                                pattern="\\d*"
                                value={pendingUploadLevelId}
                                onChange={(e) => setPendingUploadLevelId(e.target.value)}
                            />
                            <div className="text-xs text-stone-400">
                                {(() => {
                                    const id = parseInt(pendingUploadLevelId, 10);
                                    if (!Number.isFinite(id)) return null;
                                    const exists = allLevels.some((l) => l.id === id);
                                    return exists ? 'Existing level' : 'New level';
                                })()}
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm text-stone-300">
                            <input
                                type="checkbox"
                                checked={pendingUploadAllowOverwrite}
                                onChange={(e) => setPendingUploadAllowOverwrite(e.target.checked)}
                            />
                            Allow overwrite (advanced)
                        </label>

                        {pendingUploadError ? (
                            <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                {pendingUploadError}
                            </div>
                        ) : null}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]"
                            onClick={() => {
                                setApplyDialogOpen(false);
                                setPendingUploadFile(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-emerald-600 text-white hover:bg-emerald-500"
                            onClick={async () => {
                                const file = pendingUploadFile;
                                const levelId = parseInt(pendingUploadLevelId, 10);
                                if (!file || !Number.isInteger(levelId) || levelId <= 0) {
                                    setPendingUploadError('Enter a valid level number.');
                                    return;
                                }

                                try {
                                    setPendingUploadError('');
                                    setApplyDialogOpen(false);

                                    setIsDetecting(true);
                                    setDetectionProgress(`Saving ${file.name} as Level ${levelId}...`);

                                    const uploadUrl = URL.createObjectURL(file);
                                    const normalizedUrl = await normalizeMapperImage(uploadUrl);
                                    try { URL.revokeObjectURL(uploadUrl); } catch { /* ignore */ }

                                    const blob = await fetch(normalizedUrl).then((r) => r.blob());
                                    await putLevelImage(levelId, blob, file.name, pendingUploadAllowOverwrite);

                                    // Optional: in local dev, also write into `src/assets/NN.png` via the asset-writer helper.
                                    // This cannot work on GitHub Pages (static hosting), but it makes the "upload -> assets folder"
                                    // workflow possible locally when `npm run asset-writer` is running.
                                    if (import.meta.env.DEV) {
                                        const writerBase = (import.meta.env.VITE_ASSET_WRITER_URL as string | undefined) ?? 'http://localhost:8787/write-level-image';
                                        try {
                                            await fetch(`${writerBase}?id=${levelId}&overwrite=${pendingUploadAllowOverwrite ? 1 : 0}`, {
                                                method: 'POST',
                                                body: blob,
                                            });
                                        } catch (err) {
                                            console.warn('asset-writer not available (skipping):', err);
                                        }
                                    }

                                    // Create a new custom level definition only when the level id does not exist yet.
                                    // This never overwrites built-in levels.
                                    let nextLevels = allLevels;
                                    let idx = nextLevels.findIndex((l) => l.id === levelId);
                                    if (idx === -1) {
                                        const newLevel: Level = {
                                            id: levelId,
                                            grid: voidGrid(DEFAULT_MAPPER_ROWS, DEFAULT_MAPPER_COLS),
                                            playerStart: { x: 0, y: 0 },
                                            cavePos: { x: 0, y: 0 },
                                            theme: guessThemeForLevelId(levelId),
                                            autoBuild: false,
                                        };
                                        saveCustomLevelDefinition(newLevel);
                                        nextLevels = [...nextLevels, newLevel].sort((a, b) => a.id - b.id);
                                        setAllLevels(nextLevels);
                                        idx = nextLevels.findIndex((l) => l.id === levelId);
                                    }

                                    setImportLevelIndex(idx);
                                    setCompareLevelIndex(idx);
                                    await loadLevelByIndex(idx);

                                    // Auto-detect immediately (fast snap).
                                    setDetectionProgress('Snapping grid to floor tiles...');
                                    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
                                    await runCellDetection();
                                } catch (err) {
                                    console.error(err);
                                    setPendingUploadError((err as Error).message ?? 'Upload failed.');
                                    setApplyDialogOpen(true);
                                } finally {
                                    setIsDetecting(false);
                                    setDetectionProgress('');
                                    setPendingUploadFile(null);
                                }
                            }}
                        >
                            Apply + Snap
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="relative space-y-3 px-4 py-4 pr-5">
                    {isDetecting && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-[24px] bg-stone-950/75 backdrop-blur-sm">
                            <div className="rounded-[22px] border border-sky-300/20 bg-stone-900/95 p-6 text-sky-50 shadow-lg">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-300"></div>
                                    <div className="text-sm font-medium text-sky-50">{detectionProgress}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTile === 20 && (
                        <MapperSection
                            title="Bonus Time Brush"
                            eyebrow="Tile Metadata"
                            description="Tile 20 stores its own per-cell time bonus. Set the amount that gets applied while painting."
                            contentClassName="pt-3"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    className="h-10 w-24 rounded-2xl border border-white/10 bg-stone-900/85 px-3 text-sm text-stone-100 [color-scheme:dark]"
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    step={1}
                                    value={hourglassBrushSeconds}
                                    onChange={(e) => {
                                        const raw = e.target.value;
                                        const n = Math.max(1, Math.min(86400, Math.round(Number(raw)) || 0));
                                        setHourglassBrushSeconds(n);
                                    }}
                                    title="Seconds added when Bonus Time is collected"
                                />
                                <div className="text-[11px] text-stone-400">seconds added when the hourglass is collected</div>
                            </div>
                        </MapperSection>
                    )}
            </div>
            </div>

            {resizable ? (
                <MapperResizeHandle
                    side="right"
                    onMouseDown={onStartResize}
                    title="Resize control deck"
                />
            ) : null}
        </MapperPanelFrame>
    );
};

export default LeftPanel;
