import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_3D_HUD_SETTINGS, getAllLevels, isPlaceholderGrid, normalizeHud3DSettings, type ColorTheme, type Hud3DSettings, type LevelProvenance } from '@/data/levels';
import { emptyGrid, formatGridRowsOneLine, voidGrid } from '@/lib/levelgrid';
import { detectGridLines } from './gridDetection';
import { LevelMapperContext, type BulkContextType, type LevelMapperContextValue } from './LevelMapperStore';
import { DEFAULT_MAPPER_COLS, DEFAULT_MAPPER_ROWS } from './mapperDefaults';
import { findDuplicateGridWarning } from './duplicateGridGuard';
import { getAdminMode } from '@/lib/adminMode';
import {
    addColumnLeft as addColLeft,
    addColumnRight as addColRight,
    addRowTop as addRowT,
    addRowBottom as addRowB,
    addMultipleColumns as addMultipleCols,
    addMultipleRows as addMultipleR
} from './gridOperations';
import {
    saveGridChanges,
    exportGridToClipboard,
    loadCompareLevelIndex,
    saveCompareLevelIndex,
    loadImportLevelIndex,
    saveImportLevelIndex,
    clearImportLevel,
    saveLevelLayoutOverride,
    loadLevelImageScale,
    saveLevelImageScale,
    loadLevelMapperDraft,
    saveLevelMapperDraft,
    saveLevelMapperSavedState,
    loadLevelMapperSavedState
} from './persistenceOperations';
import {
    useJsonSync,
    useBeforeUnload,
    useUnsavedBanner,
    useCanvasDraw,
    useSaveCompareLevel,
    useSaveImportLevel
} from './mapperHooks';
import { getCellReferences as getStoredCellReferences, loadImageData } from '@/lib/spriteMatching';
import { getAlignmentHints } from './alignmentProfile';
import { OVERLAY_IMAGE_SCALE_Y_BASE, normalizeOverlayUserScaleY } from './overlayDefaults';
import { resolveLevelMapperBaseline } from './levelBaseline';
import { detectDeterministicGridWithTraining } from './geometryGridFitter';
import {
    createTileSignatureFromImageData,
    createTileSignatureFromRegion,
    getMapperTrainingHints,
    getMapperTrainingSet,
    invalidateMapperTrainingSetCache,
    tileSignatureSimilarity,
    type TileSignature,
} from './mapperTrainingSet';
import { toast } from 'sonner';
import type { LevelMapperDraft, LevelMapperHistoryEntry } from './LevelMapperStore';
console.log('📦 LevelMapperContext.tsx loading...');

// Sample interior pixels to avoid gridlines/adjacent cell bleed when matching sprites.
const CELL_SAMPLE_INSET_RATIO = 0.12;
const MAX_AUTO_DETECT_CELLS = 320;

// Types
// LevelMapperContextValue lives in LevelMapperStore.ts (to keep Fast Refresh stable)

const reshapeGridPreservingOverlap = (prev: number[][], nextRows: number, nextCols: number, fill = 5) => {
    const next = Array.from({ length: nextRows }, () => Array(nextCols).fill(fill));
    const rMax = Math.min(prev.length, nextRows);
    const cMax = Math.min(prev[0]?.length ?? 0, nextCols);
    for (let r = 0; r < rMax; r += 1) {
        for (let c = 0; c < cMax; c += 1) next[r][c] = prev[r][c];
    }
    return next;
};

const parseCoordKey = (key: string): { x: number; y: number } | null => {
    const parts = key.split(',');
    if (parts.length !== 2) return null;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    return { x, y };
};

const clampHourglassBonusByCell = (prev: Record<string, number>, rows: number, cols: number) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(prev)) {
        const pos = parseCoordKey(k);
        if (!pos) continue;
        if (pos.x < 0 || pos.y < 0 || pos.y >= rows || pos.x >= cols) continue;
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        out[`${pos.x},${pos.y}`] = Math.max(1, Math.min(86400, Math.round(n)));
    }
    return out;
};

const shiftHourglassBonusByCell = (
    prev: Record<string, number>,
    dx: number,
    dy: number,
    rows: number,
    cols: number
) => {
    if (dx === 0 && dy === 0) return clampHourglassBonusByCell(prev, rows, cols);
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(prev)) {
        const pos = parseCoordKey(k);
        if (!pos) continue;
        const x = pos.x + dx;
        const y = pos.y + dy;
        if (x < 0 || y < 0 || y >= rows || x >= cols) continue;
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        out[`${x},${y}`] = Math.max(1, Math.min(86400, Math.round(n)));
    }
    return out;
};

const stripJsonComments = (value: string) => value.replace(/\/\/.*$/gm, '').trim();

const parseGridJson = (value: string): number[][] => {
    const parsed = JSON.parse(stripJsonComments(value));

    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Grid JSON must be a non-empty array of rows.');
    }

    if (!parsed.every((row) => Array.isArray(row))) {
        throw new Error('Every row in the grid JSON must be an array.');
    }

    const cols = parsed[0].length;
    if (cols === 0) {
        throw new Error('Grid JSON rows cannot be empty.');
    }

    const normalized = parsed.map((row, rowIndex) => {
        if (row.length !== cols) {
            throw new Error(`Row ${rowIndex + 1} has ${row.length} cells; expected ${cols}.`);
        }

        return row.map((cell, cellIndex) => {
            const valueAsNumber = Number(cell);
            if (!Number.isInteger(valueAsNumber) || valueAsNumber < 0) {
                throw new Error(`Cell at row ${rowIndex + 1}, col ${cellIndex + 1} is not a valid tile id.`);
            }
            return valueAsNumber;
        });
    });

    return normalized;
};

const DRAFT_HISTORY_LIMIT = 80;

const cloneGrid = (value: number[][]) => value.map((row) => [...row]);

const isValidGrid = (value: unknown): value is number[][] => {
    if (!Array.isArray(value) || value.length === 0) return false;
    if (!value.every((row) => Array.isArray(row))) return false;
    const width = (value[0] as unknown[]).length;
    if (width === 0) return false;
    return value.every((row) => (row as unknown[]).length === width);
};

const cloneHistoryEntry = (entry: LevelMapperHistoryEntry): LevelMapperHistoryEntry => {
    if (Array.isArray(entry)) return cloneGrid(entry);
    return {
        ...entry,
        grid: cloneGrid(entry.grid),
    };
};

const normalizeHistoryEntry = (value: unknown): LevelMapperHistoryEntry | null => {
    if (isValidGrid(value)) return cloneGrid(value);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Partial<Extract<LevelMapperHistoryEntry, { kind: 'layout' }>>;
    if (candidate.kind !== 'layout' || !isValidGrid(candidate.grid)) return null;
    const rows = Math.max(1, Math.round(Number(candidate.rows) || candidate.grid.length));
    const cols = Math.max(1, Math.round(Number(candidate.cols) || (candidate.grid[0]?.length ?? 0)));
    const imageScaleX = Number(candidate.imageScaleX ?? 1);
    const imageScaleY = Number(candidate.imageScaleY ?? 1);
    const imageOffsetX = Number(candidate.imageOffsetX ?? 0);
    const imageOffsetY = Number(candidate.imageOffsetY ?? 0);
    const gridOffsetX = Number(candidate.gridOffsetX ?? 0);
    const gridOffsetY = Number(candidate.gridOffsetY ?? 0);
    const gridFrameWidth =
        candidate.gridFrameWidth == null || !Number.isFinite(Number(candidate.gridFrameWidth))
            ? null
            : Math.max(1, Number(candidate.gridFrameWidth));
    const gridFrameHeight =
        candidate.gridFrameHeight == null || !Number.isFinite(Number(candidate.gridFrameHeight))
            ? null
            : Math.max(1, Number(candidate.gridFrameHeight));
    return {
        kind: 'layout',
        grid: cloneGrid(candidate.grid),
        rows,
        cols,
        imageScaleX: Number.isFinite(imageScaleX) ? imageScaleX : 1,
        imageScaleY: Number.isFinite(imageScaleY) ? imageScaleY : 1,
        imageOffsetX: Number.isFinite(imageOffsetX) ? imageOffsetX : 0,
        imageOffsetY: Number.isFinite(imageOffsetY) ? imageOffsetY : 0,
        lockImageAspect: Boolean(candidate.lockImageAspect ?? false),
        gridOffsetX: Number.isFinite(gridOffsetX) ? gridOffsetX : 0,
        gridOffsetY: Number.isFinite(gridOffsetY) ? gridOffsetY : 0,
        gridFrameWidth,
        gridFrameHeight,
    };
};

const normalizeHistoryStack = (value: unknown): LevelMapperHistoryEntry[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map(normalizeHistoryEntry)
        .filter((entry): entry is LevelMapperHistoryEntry => entry !== null)
        .slice(-DRAFT_HISTORY_LIMIT);
};

export const LevelMapperProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    console.log('⚛️ LevelMapperProvider initializing...');

        const [gridOffsetX, setGridOffsetX] = useState(0);
        const [gridOffsetY, setGridOffsetY] = useState(0);
        const [gridFrameWidth, setGridFrameWidth] = useState<number | null>(null);
        const [gridFrameHeight, setGridFrameHeight] = useState<number | null>(null);
        const [zoom, setZoom] = useState(1);
        console.log('✓ Basic state initialized');

        const canvasRef = useRef<HTMLCanvasElement | null>(null);
        // Default mapper layout is 11x20.
        const [rows, setRows] = useState(DEFAULT_MAPPER_ROWS);
        const [cols, setCols] = useState(DEFAULT_MAPPER_COLS);
        const [activeTile, setActiveTile] = useState(0);
        const [grid, setGrid] = useState<number[][]>(() => emptyGrid(DEFAULT_MAPPER_ROWS, DEFAULT_MAPPER_COLS));
        const [hourglassBonusByCell, setHourglassBonusByCell] = useState<Record<string, number>>(() => {
            if (typeof window === 'undefined') return {};
            try {
                const raw = localStorage.getItem('levelmapper_hourglassBonusByCell');
                if (!raw) return {};
                const parsed = JSON.parse(raw) as unknown;
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
                return clampHourglassBonusByCell(
                    parsed as Record<string, number>,
                    DEFAULT_MAPPER_ROWS,
                    DEFAULT_MAPPER_COLS
                );
            } catch {
                return {};
            }
        });
        const [hourglassBrushSeconds, setHourglassBrushSeconds] = useState<number>(() => {
            if (typeof window === 'undefined') return 50;
            try {
                const raw = localStorage.getItem('levelmapper_hourglassBrushSeconds');
                const n = raw == null ? 50 : Number(raw);
                if (!Number.isFinite(n)) return 50;
                return Math.max(1, Math.min(86400, Math.round(n)));
            } catch {
                return 50;
            }
        });
        const [playerStart, setPlayerStart] = useState<{ x: number; y: number } | null>(null);
        const [currentLevelProvenance, setCurrentLevelProvenance] = useState<LevelProvenance | undefined>(undefined);
        const [theme, setTheme] = useState<ColorTheme | undefined>(undefined);
        const [timeLimitSeconds, setTimeLimitSeconds] = useState<number | null>(() => {
            if (typeof window === 'undefined') return null;
            try {
                const raw = localStorage.getItem('levelmapper_timeLimitSeconds');
                if (!raw) return null;
                const n = Number(raw);
                if (!Number.isFinite(n)) return null;
                return Math.max(0, Math.round(n));
            } catch {
                return null;
            }
        });
        const [hud3d, setHud3d] = useState<Hud3DSettings>(() => normalizeHud3DSettings(DEFAULT_3D_HUD_SETTINGS));
        console.log('✓ Grid state initialized');

        const [allLevels, setAllLevels] = useState(() => {
            console.log('🔍 Loading all levels...');
            const levels = getAllLevels();
            console.log('✓ Levels loaded:', levels.length);
            return levels;
        });

        // Persistent compare level index - remember last selection
        const [compareLevelIndex, setCompareLevelIndex] = useState(loadCompareLevelIndex);
        const compareLevel = allLevels[compareLevelIndex];

        // Persistent import level index - remember last loaded level
        const [importLevelIndex, setImportLevelIndex] = useState<number | null>(loadImportLevelIndex);

        const [imageURL, setImageURL] = useState<string | null>(null);
        const [showGrid, setShowGrid] = useState(true);
        const [jsonInput, setJsonInput] = useState('');
        const [isSaved, setIsSaved] = useState(true);
        const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
        const [lastSavedRepoStatus, setLastSavedRepoStatus] = useState<'saved' | 'failed' | 'unavailable' | null>(null);
        const [showUnsavedBanner, setShowUnsavedBanner] = useState(true);
        const prevSizeRef = useRef({ rows, cols });
        const skipAutoResizeRef = useRef(false);
        const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: BulkContextType } | null>(null);
        type UndoLayoutSnapshot = Extract<LevelMapperHistoryEntry, { kind: 'layout' }>;
        type UndoEntry = LevelMapperHistoryEntry;
        const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
        const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
        const [overlayEnabled, setOverlayEnabled] = useState(false);
        const [overlayOpacity, setOverlayOpacity] = useState(0.5);
        const [overlayStretch, setOverlayStretch] = useState(true);
        const [imageScaleX, setImageScaleX] = useState(1);
        const [imageScaleY, setImageScaleY] = useState(1);
        const [imageOffsetX, setImageOffsetX] = useState(0);
        const [imageOffsetY, setImageOffsetY] = useState(0);
        const [lockImageAspect, setLockImageAspect] = useState(false);
        const [lastGridDetection, setLastGridDetection] = useState<ReturnType<typeof detectGridLines> | null>(null);
        const loadedSnapshotRef = useRef<null | {
            levelId?: number | null;
            grid: number[][];
            playerStart: { x: number; y: number } | null;
            provenance?: LevelProvenance;
            theme: ColorTheme | undefined;
            timeLimitSeconds: number | null;
            hud3d: Hud3DSettings;
            hourglassBonusByCell: Record<string, number>;
            imageURL: string | null;
            overlayEnabled: boolean;
            overlayOpacity: number;
            overlayStretch: boolean;
            imageScaleX: number;
            imageScaleY: number;
            imageOffsetX: number;
            imageOffsetY: number;
            lockImageAspect: boolean;
            zoom: number;
            gridOffsetX: number;
            gridOffsetY: number;
            gridFrameWidth: number | null;
            gridFrameHeight: number | null;
        }>(null);
        const currentLevelId = importLevelIndex !== null ? allLevels[importLevelIndex]?.id ?? null : null;

        const restoreDraftForLevel = (levelId: number) => {
            const draft = loadLevelMapperDraft(levelId);
            if (!draft || !isValidGrid(draft.grid)) return false;

            const nextRows = Math.max(1, Math.round(Number(draft.rows) || draft.grid.length));
            const nextCols = Math.max(1, Math.round(Number(draft.cols) || (draft.grid[0]?.length ?? 0)));
            const nextGrid =
                draft.grid.length === nextRows && (draft.grid[0]?.length ?? 0) === nextCols
                    ? cloneGrid(draft.grid)
                    : reshapeGridPreservingOverlap(draft.grid, nextRows, nextCols, 5);
            const nextPlayerStart =
                draft.playerStart &&
                Number.isInteger(draft.playerStart.x) &&
                Number.isInteger(draft.playerStart.y)
                    ? {
                        x: Math.max(0, Math.min(nextCols - 1, draft.playerStart.x)),
                        y: Math.max(0, Math.min(nextRows - 1, draft.playerStart.y)),
                    }
                    : null;
            const nextTimeLimitSeconds =
                draft.timeLimitSeconds != null && Number.isFinite(draft.timeLimitSeconds)
                    ? Math.max(0, Math.round(draft.timeLimitSeconds))
                    : null;
            const nextHud3d = normalizeHud3DSettings(draft.hud3d);
            const nextProvenance =
                draft.provenance === 'user-edited' || draft.provenance === 'ai-detected'
                    ? draft.provenance
                    : undefined;
            const nextHourglassBonusByCell = clampHourglassBonusByCell(
                draft.hourglassBonusByCell ?? {},
                nextRows,
                nextCols
            );
            const nextOverlayOpacity =
                Number.isFinite(Number(draft.overlayOpacity))
                    ? Math.max(0, Math.min(1, Number(draft.overlayOpacity)))
                    : 0.5;
            const nextImageScaleX =
                Number.isFinite(Number(draft.imageScaleX))
                    ? Math.max(0.85, Math.min(1.15, Number(draft.imageScaleX)))
                    : 1;
            const nextImageScaleY =
                Number.isFinite(Number(draft.imageScaleY))
                    ? normalizeOverlayUserScaleY(
                        Number(draft.imageScaleY),
                        Number((draft as Partial<LevelMapperDraft>).overlayScaleBaseY)
                    )
                    : 1;
            const nextImageOffsetX =
                Number.isFinite(Number((draft as Partial<LevelMapperDraft>).imageOffsetX))
                    ? Math.max(0, Number((draft as Partial<LevelMapperDraft>).imageOffsetX))
                    : 0;
            const nextImageOffsetY =
                Number.isFinite(Number(draft.imageOffsetY))
                    ? Math.max(0, Number(draft.imageOffsetY))
                    : 0;
            const nextZoom =
                Number.isFinite(Number(draft.zoom))
                    ? Math.max(0.2, Math.min(6, Number(draft.zoom)))
                    : 1;
            const nextGridOffsetX =
                Number.isFinite(Number(draft.gridOffsetX)) ? Number(draft.gridOffsetX) : 0;
            const nextGridOffsetY =
                Number.isFinite(Number(draft.gridOffsetY)) ? Number(draft.gridOffsetY) : 0;
            const nextGridFrameWidth =
                Number.isFinite(Number(draft.gridFrameWidth)) ? Math.max(1, Number(draft.gridFrameWidth)) : null;
            const nextGridFrameHeight =
                Number.isFinite(Number(draft.gridFrameHeight)) ? Math.max(1, Number(draft.gridFrameHeight)) : null;
            const nextUndoStack = normalizeHistoryStack(draft.undoStack);
            const nextRedoStack = normalizeHistoryStack(draft.redoStack);

            skipAutoResizeRef.current = true;
            prevSizeRef.current = { rows: nextRows, cols: nextCols };
            setRows(nextRows);
            setCols(nextCols);
            setGrid(nextGrid);
            setPlayerStart(nextPlayerStart);
            setCurrentLevelProvenance(nextProvenance);
            setTheme(draft.theme);
            setTimeLimitSeconds(nextTimeLimitSeconds);
            setHud3d(nextHud3d);
            setHourglassBonusByCell(nextHourglassBonusByCell);
            setOverlayEnabled(Boolean(draft.overlayEnabled));
            setOverlayOpacity(nextOverlayOpacity);
            setOverlayStretch(Boolean(draft.overlayStretch));
            setImageScaleX(nextImageScaleX);
            setImageScaleY(nextImageScaleY);
            setImageOffsetX(nextImageOffsetX);
            setImageOffsetY(nextImageOffsetY);
            setLockImageAspect(Boolean(draft.lockImageAspect ?? false));
            setZoom(nextZoom);
            setGridOffsetX(nextGridOffsetX);
            setGridOffsetY(nextGridOffsetY);
            setGridFrameWidth(nextGridFrameWidth);
            setGridFrameHeight(nextGridFrameHeight);
            setUndoStack(nextUndoStack);
            setRedoStack(nextRedoStack);
            setIsSaved(false);
            return true;
        };

        // Use custom hooks for side effects
        useJsonSync(grid, jsonInput, setJsonInput);
        useBeforeUnload(isSaved);
        useUnsavedBanner(isSaved, setShowUnsavedBanner);
        useCanvasDraw(canvasRef, imageURL, showGrid, rows, cols, gridOffsetX, gridOffsetY);
        useSaveCompareLevel(compareLevelIndex, saveCompareLevelIndex);
        useSaveImportLevel(importLevelIndex, saveImportLevelIndex);

        // Persist the hourglass brush (tool) value between sessions.
        useEffect(() => {
            if (typeof window === 'undefined') return;
            try {
                localStorage.setItem('levelmapper_hourglassBrushSeconds', String(hourglassBrushSeconds));
            } catch {
                // ignore
            }
        }, [hourglassBrushSeconds]);

        // Detection results are image-specific; clear when the image changes.
        useEffect(() => {
            setLastGridDetection(null);
        }, [imageURL]);

        // Persist per-level layout (rows/cols) so placeholder auto-build levels can remember a user-chosen size
        // like "Level 21 is 11 rows" even before the grid is fully mapped.
        useEffect(() => {
            if (importLevelIndex === null) return;
            const lvl = allLevels[importLevelIndex];
            if (!lvl) return;
            saveLevelLayoutOverride(lvl.id, rows, cols);
        }, [rows, cols, importLevelIndex, allLevels]);

        // Keep hourglass metadata within current grid bounds.
        useEffect(() => {
            setHourglassBonusByCell((prev) => {
                const next = clampHourglassBonusByCell(prev, rows, cols);
                const prevKeys = Object.keys(prev);
                const nextKeys = Object.keys(next);
                if (prevKeys.length !== nextKeys.length) return next;
                for (const k of nextKeys) {
                    if (prev[k] !== next[k]) return next;
                }
                return prev;
            });
        }, [rows, cols]);

        // Persist per-level overlay image distortion (X/Y) so clipped/non-square screenshots can be aligned precisely.
        useEffect(() => {
            if (importLevelIndex === null) return;
            const lvl = allLevels[importLevelIndex];
            if (!lvl) return;
            // Load saved tweak when switching levels.
            const saved = loadLevelImageScale(lvl.id);
            if (saved) {
                const x = Number(saved.x);
                const y = Number(saved.y);
                const offsetX = Number(saved.offsetX ?? 0);
                const offsetY = Number(saved.offsetY ?? 0);
                const lock = Boolean(saved.lock);
                if (Number.isFinite(x)) setImageScaleX(Math.max(0.85, Math.min(1.15, x)));
                if (Number.isFinite(y)) setImageScaleY(y);
                if (Number.isFinite(offsetX)) setImageOffsetX(Math.max(0, offsetX));
                if (Number.isFinite(offsetY)) setImageOffsetY(Math.max(0, offsetY));
                setLockImageAspect(lock);
            } else {
                setImageScaleX(1);
                setImageScaleY(1);
                setImageOffsetX(0);
                setImageOffsetY(0);
                setLockImageAspect(false);
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [importLevelIndex]);

        useEffect(() => {
            if (importLevelIndex === null) return;
            const lvl = allLevels[importLevelIndex];
            if (!lvl) return;
            saveLevelImageScale(lvl.id, { x: imageScaleX, y: imageScaleY, offsetX: imageOffsetX, offsetY: imageOffsetY, lock: lockImageAspect });
        }, [importLevelIndex, allLevels, imageScaleX, imageScaleY, imageOffsetX, imageOffsetY, lockImageAspect]);

        // Auto-persist the current per-level mapper draft, including undo/redo history,
        // so refreshes/crashes do not lose manual work in progress.
        useEffect(() => {
            if (currentLevelId == null) return;
            if (loadedSnapshotRef.current?.levelId !== currentLevelId) return;
            if (isSaved) return;
            const timer = window.setTimeout(() => {
                const draft: LevelMapperDraft = {
                    rows,
                    cols,
                    grid: cloneGrid(grid),
                    playerStart: playerStart ? { ...playerStart } : null,
                    provenance: currentLevelProvenance,
                    theme,
                    timeLimitSeconds,
                    hud3d,
                    hourglassBonusByCell: { ...(hourglassBonusByCell ?? {}) },
                    overlayEnabled,
                    overlayOpacity,
                    overlayStretch,
                    imageScaleX,
                    imageScaleY,
                    overlayScaleBaseY: OVERLAY_IMAGE_SCALE_Y_BASE,
                    imageOffsetX,
                    imageOffsetY,
                    lockImageAspect,
                    zoom,
                    gridOffsetX,
                    gridOffsetY,
                    gridFrameWidth,
                    gridFrameHeight,
                    undoStack: undoStack.slice(-DRAFT_HISTORY_LIMIT).map(cloneHistoryEntry),
                    redoStack: redoStack.slice(-DRAFT_HISTORY_LIMIT).map(cloneHistoryEntry),
                    updatedAt: Date.now(),
                };
                saveLevelMapperDraft(currentLevelId, draft);
            }, 200);

            return () => window.clearTimeout(timer);
        }, [
            currentLevelId,
            rows,
            cols,
            grid,
            playerStart,
            currentLevelProvenance,
            theme,
            timeLimitSeconds,
            hud3d,
            hourglassBonusByCell,
            overlayEnabled,
            overlayOpacity,
            overlayStretch,
            imageScaleX,
            imageScaleY,
            imageOffsetX,
            imageOffsetY,
            lockImageAspect,
            zoom,
            gridOffsetX,
            gridOffsetY,
            gridFrameWidth,
            gridFrameHeight,
            undoStack,
            redoStack,
            isSaved,
        ]);

        // Auto-load level on startup if one was previously imported.
        // For placeholder auto-build levels, load the image and keep the editor responsive
        // instead of running a heavy full image-to-grid build during mount.
        useEffect(() => {
            if (importLevelIndex !== null) {
                const lvl = allLevels[importLevelIndex];
                if (lvl?.grid) {
                    const loadLevelIntoMapper = async () => {
                        const baseline = await resolveLevelMapperBaseline(lvl);
                        const hasNonVoidCells = baseline.grid.some((row) => row.some((cell) => cell !== 5));
                        if (!hasNonVoidCells && !baseline.imageURL) {
                            console.log(`Skipped auto-loading Level ${baseline.levelId} (empty/void grid)`);
                            clearImportLevel();
                            setImportLevelIndex(null);
                            return;
                        }

                        const targetRows = Math.max(1, rows || DEFAULT_MAPPER_ROWS);
                        const targetCols = Math.max(1, cols || DEFAULT_MAPPER_COLS);
                        const fittedGrid = reshapeGridPreservingOverlap(
                            baseline.grid,
                            targetRows,
                            targetCols,
                            5
                        );
                        const fittedPlayerStart = baseline.playerStart
                            ? {
                                x: Math.min(Math.max(0, baseline.playerStart.x), targetCols - 1),
                                y: Math.min(Math.max(0, baseline.playerStart.y), targetRows - 1),
                            }
                            : null;

                        skipAutoResizeRef.current = true;
                        prevSizeRef.current = { rows: targetRows, cols: targetCols };
                        setRows(targetRows);
                        setCols(targetCols);
                        setGrid(cloneGrid(fittedGrid));
                        setHourglassBonusByCell({ ...(baseline.hourglassBonusByCell ?? {}) });
                        setTimeLimitSeconds(baseline.timeLimitSeconds);
                        setHud3d(baseline.hud3d);
                        setImageURL(baseline.imageURL);
                        setOverlayEnabled(baseline.overlayEnabled);
                        setOverlayOpacity(baseline.overlayOpacity);
                        setOverlayStretch(baseline.overlayStretch);
                        setImageScaleX(baseline.imageScaleX);
                        setImageScaleY(baseline.imageScaleY);
                        setImageOffsetX(baseline.imageOffsetX);
                        setImageOffsetY(baseline.imageOffsetY);
                        setLockImageAspect(baseline.lockImageAspect);
                        setZoom(baseline.zoom);
                        setGridOffsetX(baseline.gridOffsetX);
                        setGridOffsetY(baseline.gridOffsetY);
                        setGridFrameWidth(baseline.gridFrameWidth);
                        setGridFrameHeight(baseline.gridFrameHeight);
                        setPlayerStart(fittedPlayerStart);
                        setCurrentLevelProvenance(baseline.provenance);
                        setTheme(baseline.theme);
                        setLoadedSnapshot({
                            levelId: baseline.levelId,
                            grid: fittedGrid,
                            playerStart: fittedPlayerStart,
                            provenance: baseline.provenance,
                            theme: baseline.theme,
                            timeLimitSeconds: baseline.timeLimitSeconds,
                            hud3d: baseline.hud3d,
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
                        setUndoStack([]);
                        setRedoStack([]);
                        setIsSaved(true);
                        // Seed the "last saved" indicator from this level's persisted saved-state (survives reloads);
                        // the repo-override outcome itself is only known for saves made in the current session.
                        const persistedSavedState = loadLevelMapperSavedState(baseline.levelId);
                        setLastSavedAt(persistedSavedState?.updatedAt ?? null);
                        setLastSavedRepoStatus(null);
                        console.log(`Auto-loaded Level ${baseline.levelId} from saved/default mapper baseline`);
                    };

                    void loadLevelIntoMapper();
                }
            }
        }, []); // Only run on mount

        // Resize dimension change effect
        useEffect(() => {
            if (prevSizeRef.current.rows === rows && prevSizeRef.current.cols === cols) return;
            if (skipAutoResizeRef.current) { prevSizeRef.current = { rows, cols }; skipAutoResizeRef.current = false; return; }
            const prevRows = prevSizeRef.current.rows; const prevCols = prevSizeRef.current.cols; const prevGrid = grid;
            const growRows = Math.max(0, rows - prevRows); const growCols = Math.max(0, cols - prevCols);
            const topPad = Math.floor(growRows / 2); const leftPad = Math.floor(growCols / 2);
            const topCrop = Math.max(0, Math.floor((prevRows - rows) / 2)); const leftCrop = Math.max(0, Math.floor((prevCols - cols) / 2));
            const newGrid: number[][] = Array.from({ length: rows }, (_, r) => {
                const srcR = r - topPad + topCrop;
                return Array.from({ length: cols }, (_, c) => {
                    const srcC = c - leftPad + leftCrop;
                    if (srcR >= 0 && srcR < prevRows && srcC >= 0 && srcC < prevCols && prevGrid[srcR]?.[srcC] !== undefined) {
                        return prevGrid[srcR][srcC];
                    }
                    return 5;
                });
            });
            setUndoStack(s => [...s, prevGrid.map(row => [...row])]); setRedoStack([]); setIsSaved(false); setGrid(newGrid); prevSizeRef.current = { rows, cols };
        }, [rows, cols]);

        // Grid manipulation functions using extracted modules
        const addColumnLeft = () => addColLeft(grid, setGrid, setCols, setUndoStack, setRedoStack, setIsSaved, skipAutoResizeRef, prevSizeRef, rows);
        const addColumnRight = () => addColRight(grid, setGrid, setCols, setUndoStack, setRedoStack, setIsSaved, skipAutoResizeRef, prevSizeRef, rows);
        const addRowTop = () => addRowT(grid, setGrid, setRows, setCols, setUndoStack, setRedoStack, setIsSaved, skipAutoResizeRef, prevSizeRef, cols);
        const addRowBottom = () => addRowB(grid, setGrid, setRows, setCols, setUndoStack, setRedoStack, setIsSaved, skipAutoResizeRef, prevSizeRef, cols);
        const addMultipleColumns = (side: 'left' | 'right', count: number) => addMultipleCols(side, count, grid, setGrid, setCols, setUndoStack, setRedoStack, setIsSaved, skipAutoResizeRef, prevSizeRef, rows);
        const addMultipleRows = (side: 'top' | 'bottom', count: number) => addMultipleR(side, count, grid, setGrid, setRows, setCols, setUndoStack, setRedoStack, setIsSaved, skipAutoResizeRef, prevSizeRef, cols);

        const removeColumnLeft = () => {
            setGrid((g) => {
                const width = g[0]?.length ?? cols;
                if (width <= 1) return g;
                const snap = g.map((r) => [...r]);
                setUndoStack((s) => [...s, snap]);
                setRedoStack([]);
                setIsSaved(false);
                const newG = g.map((r) => r.slice(1));
                skipAutoResizeRef.current = true;
                setCols(width - 1);
                prevSizeRef.current = { rows: g.length, cols: width - 1 };
                setPlayerStart((prev) =>
                    prev ? { x: Math.max(0, prev.x - 1), y: Math.min(prev.y, g.length - 1) } : prev
                );
                return newG;
            });
        };

        const removeColumnRight = () => {
            setGrid((g) => {
                const width = g[0]?.length ?? cols;
                if (width <= 1) return g;
                const snap = g.map((r) => [...r]);
                setUndoStack((s) => [...s, snap]);
                setRedoStack([]);
                setIsSaved(false);
                const newG = g.map((r) => r.slice(0, -1));
                skipAutoResizeRef.current = true;
                setCols(width - 1);
                prevSizeRef.current = { rows: g.length, cols: width - 1 };
                setPlayerStart((prev) =>
                    prev ? { x: Math.min(prev.x, width - 2), y: Math.min(prev.y, g.length - 1) } : prev
                );
                return newG;
            });
        };

        const removeRowTop = () => {
            setGrid((g) => {
                const height = g.length;
                if (height <= 1) return g;
                const snap = g.map((r) => [...r]);
                setUndoStack((s) => [...s, snap]);
                setRedoStack([]);
                setIsSaved(false);
                const newG = g.slice(1).map((r) => [...r]);
                skipAutoResizeRef.current = true;
                setRows(height - 1);
                prevSizeRef.current = { rows: height - 1, cols: g[0]?.length ?? cols };
                setPlayerStart((prev) =>
                    prev
                        ? { x: Math.min(prev.x, (g[0]?.length ?? cols) - 1), y: Math.max(0, prev.y - 1) }
                        : prev
                );
                return newG;
            });
        };

        const removeRowBottom = () => {
            setGrid((g) => {
                const height = g.length;
                if (height <= 1) return g;
                const snap = g.map((r) => [...r]);
                setUndoStack((s) => [...s, snap]);
                setRedoStack([]);
                setIsSaved(false);
                const newG = g.slice(0, -1).map((r) => [...r]);
                skipAutoResizeRef.current = true;
                setRows(height - 1);
                prevSizeRef.current = { rows: height - 1, cols: g[0]?.length ?? cols };
                setPlayerStart((prev) =>
                    prev
                        ? { x: Math.min(prev.x, (g[0]?.length ?? cols) - 1), y: Math.min(prev.y, height - 2) }
                        : prev
                );
                return newG;
            });
        };

        const createLayoutUndoEntry = (): UndoLayoutSnapshot => ({
            kind: 'layout',
            grid: grid.map((r) => [...r]),
            rows,
            cols,
            imageScaleX,
            imageScaleY,
            imageOffsetX,
            imageOffsetY,
            lockImageAspect,
            gridOffsetX,
            gridOffsetY,
            gridFrameWidth,
            gridFrameHeight,
        });

        const pushUndoSnapshot = () => {
            setUndoStack((s) => [...s, createLayoutUndoEntry()]);
            setRedoStack([]);
            setIsSaved(false);
        };

        const undo = () => {
            if (undoStack.length === 0) return;
            const prev = undoStack[undoStack.length - 1];

            if (Array.isArray(prev)) {
                // Grid-only edit: undo just the grid so layout tweaks remain.
                setRedoStack((s) => [...s, grid.map((r) => [...r])]);
                setGrid(prev.map((r) => [...r]));
            } else {
                // Layout tweak: undo grid + layout fields.
                setRedoStack((s) => [...s, createLayoutUndoEntry()]);
                skipAutoResizeRef.current = true;
                prevSizeRef.current = { rows: prev.rows, cols: prev.cols };
                setRows(prev.rows);
                setCols(prev.cols);
                setGrid(prev.grid.map((r) => [...r]));
                setImageScaleX(prev.imageScaleX);
                setImageScaleY(prev.imageScaleY);
                setImageOffsetX(prev.imageOffsetX);
                setImageOffsetY(prev.imageOffsetY);
                setLockImageAspect(prev.lockImageAspect);
                setGridOffsetX(prev.gridOffsetX);
                setGridOffsetY(prev.gridOffsetY);
                setGridFrameWidth(prev.gridFrameWidth);
                setGridFrameHeight(prev.gridFrameHeight);
            }

            setUndoStack((s) => s.slice(0, -1));
            setIsSaved(false);
        };

        const redo = () => {
            if (redoStack.length === 0) return;
            const next = redoStack[redoStack.length - 1];

            if (Array.isArray(next)) {
                setUndoStack((s) => [...s, grid.map((r) => [...r])]);
                setGrid(next.map((r) => [...r]));
            } else {
                setUndoStack((s) => [...s, createLayoutUndoEntry()]);
                skipAutoResizeRef.current = true;
                prevSizeRef.current = { rows: next.rows, cols: next.cols };
                setRows(next.rows);
                setCols(next.cols);
                setGrid(next.grid.map((r) => [...r]));
                setImageScaleX(next.imageScaleX);
                setImageScaleY(next.imageScaleY);
                setImageOffsetX(next.imageOffsetX);
                setImageOffsetY(next.imageOffsetY);
                setLockImageAspect(next.lockImageAspect);
                setGridOffsetX(next.gridOffsetX);
                setGridOffsetY(next.gridOffsetY);
                setGridFrameWidth(next.gridFrameWidth);
                setGridFrameHeight(next.gridFrameHeight);
            }

            setRedoStack((s) => s.slice(0, -1));
            setIsSaved(false);
        };

        const referenceSigCacheRef = useRef<{
            key: string;
            refs: TileSignature[];
        } | null>(null);

        const loadDetectionHints = async () => {
            const storedHints = getAlignmentHints();
            try {
                const learnedHints = await getMapperTrainingHints();
                return {
                    hintCellWidth: learnedHints.hintCellWidth ?? storedHints.hintCellWidth,
                    hintCellHeight: learnedHints.hintCellHeight ?? storedHints.hintCellHeight,
                    preferredCols: learnedHints.preferredCols ?? storedHints.preferredCols,
                    preferredRows: learnedHints.preferredRows ?? storedHints.preferredRows,
                };
            } catch (error) {
                console.warn('Falling back to stored alignment hints:', error);
                return storedHints;
            }
        };

        const detectGrid = async () => {
            try {
                setLockImageAspect(false);
                const maxDim = 1100; // speed: run detection on downsampled image, then scale back to source pixels
                const imageCanvas = document.createElement('canvas');
                let srcW = 0;
                let srcH = 0;

                if (imageURL) {
                    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                        const img = new Image();
                        img.decoding = 'async';
                        img.onload = () => resolve(img);
                        img.onerror = () => reject(new Error('Failed to load image for grid detection'));
                        img.src = imageURL;
                    });
                    srcW = image.width;
                    srcH = image.height;

                    const scale = Math.min(1, maxDim / Math.max(1, Math.max(srcW, srcH)));
                    const w = Math.max(1, Math.round(srcW * scale));
                    const h = Math.max(1, Math.round(srcH * scale));
                    imageCanvas.width = w;
                    imageCanvas.height = h;
                    const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });
                    if (!ctx) throw new Error('Failed to create canvas context for grid detection');
                    ctx.drawImage(image, 0, 0, w, h);
                } else {
                    const preview = canvasRef.current;
                    if (!preview) {
                        console.error('❌ No canvas/image in detectGrid');
                        return null;
                    }
                    srcW = preview.width;
                    srcH = preview.height;
                    imageCanvas.width = preview.width;
                    imageCanvas.height = preview.height;
                    const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });
                    if (!ctx) throw new Error('Failed to create canvas context for grid detection');
                    ctx.drawImage(preview, 0, 0);
                }

                const detectionHints = await loadDetectionHints();
                // Primary path: deterministic lattice fit learned from corrected levels 1–35.
                const preservePlaceholderCounts = isPlaceholderGrid(grid);
                const detected =
                    (await detectDeterministicGridWithTraining(imageCanvas, {
                        useCurrentCounts: preservePlaceholderCounts,
                        currentRows: rows,
                        currentCols: cols,
                        hints: detectionHints,
                    })) ??
                    detectGridLines(imageCanvas, preservePlaceholderCounts, rows, cols, detectionHints);
                if (!detected) {
                    setLastGridDetection(null);
                    console.error('❌ Grid detection failed');
                    alert('Grid detection failed. Try adjusting the crop so the board edges are cleaner.');
                    return null;
                }

                // If auto-detect produced a different layout with low confidence (common when a faint outer ring exists),
                // keep the user's current rows/cols and only snap offset/frame.
                const lowConfidenceLayoutChange =
                    detected.confidence < 0.35 && (detected.rows !== rows || detected.cols !== cols);
                if (lowConfidenceLayoutChange) {
                    const snapped =
                        (await detectDeterministicGridWithTraining(imageCanvas, {
                            useCurrentCounts: true,
                            currentRows: rows,
                            currentCols: cols,
                            hints: detectionHints,
                        })) ??
                        detectGridLines(imageCanvas, true, rows, cols, detectionHints);
                    if (snapped) {
                        const scaleBackX = srcW / Math.max(1, imageCanvas.width);
                        const scaleBackY = srcH / Math.max(1, imageCanvas.height);
                        const result = {
                            ...snapped,
                            offsetX: snapped.offsetX * scaleBackX,
                            offsetY: snapped.offsetY * scaleBackY,
                            cellWidth: snapped.cellWidth * scaleBackX,
                            cellHeight: snapped.cellHeight * scaleBackY,
                        };

                        console.log(
                            `⚠️ Low-confidence auto-detect (${detected.confidence.toFixed(2)}) changed layout ` +
                            `${detected.rows}x${detected.cols} -> keeping ${rows}x${cols} and snapping frame only.`
                        );

                        setLastGridDetection(result);
                        pushUndoSnapshot();

                        const nextOffsetX = Math.max(0, Math.min(srcW - 1, Math.round(result.offsetX)));
                        const nextOffsetY = Math.max(0, Math.min(srcH - 1, Math.round(result.offsetY)));
                        const nextFrameWidth = Math.min(srcW, Math.max(1, Math.round(result.cellWidth * cols)));
                        const nextFrameHeight = Math.min(srcH, Math.max(1, Math.round(result.cellHeight * rows)));

                        setGridOffsetX(nextOffsetX);
                        setGridOffsetY(nextOffsetY);
                        setGridFrameWidth(nextFrameWidth);
                        setGridFrameHeight(nextFrameHeight);
                        setIsSaved(false);
                        return result;
                    }
                }

                const scaleBackX = srcW / Math.max(1, imageCanvas.width);
                const scaleBackY = srcH / Math.max(1, imageCanvas.height);
                const result = {
                    ...detected,
                    offsetX: detected.offsetX * scaleBackX,
                    offsetY: detected.offsetY * scaleBackY,
                    cellWidth: detected.cellWidth * scaleBackX,
                    cellHeight: detected.cellHeight * scaleBackY,
                };

                console.log(`✓ Grid detected: ${result.rows}x${result.cols} (conf ${result.confidence.toFixed(2)})`);
                setLastGridDetection(result);
                pushUndoSnapshot();

                setRows(result.rows);
                setCols(result.cols);
                setPlayerStart((prev) => (prev ? { x: Math.min(prev.x, result.cols - 1), y: Math.min(prev.y, result.rows - 1) } : prev));

                // Preserve overlap if the user already painted a map; otherwise start with void.
                setGrid((prev) => {
                    const base = voidGrid(result.rows, result.cols);
                    if (isPlaceholderGrid(prev)) return base;
                    return reshapeGridPreservingOverlap(prev, result.rows, result.cols, 5);
                });

                // Snap frame to exact tile multiples in the source image pixels.
                const nextOffsetX = Math.max(0, Math.min(srcW - 1, Math.round(result.offsetX)));
                const nextOffsetY = Math.max(0, Math.min(srcH - 1, Math.round(result.offsetY)));
                const nextFrameWidth = Math.min(srcW, Math.max(1, Math.round(result.cellWidth * result.cols)));
                const nextFrameHeight = Math.min(srcH, Math.max(1, Math.round(result.cellHeight * result.rows)));

                setGridOffsetX(nextOffsetX);
                setGridOffsetY(nextOffsetY);
                setGridFrameWidth(nextFrameWidth);
                setGridFrameHeight(nextFrameHeight);
                setIsSaved(false);
                return result;
            } catch (error) {
                console.error('❌ Grid detection failed:', error);
                alert(`Grid detection failed: ${(error as Error).message}`);
                return null;
            }
        };

        // Advanced tool: keep current rows/cols, only snap frame/offset to the detected grid.
        const snapToLockedCounts = async () => {
            try {
                setLockImageAspect(false);
                if (!imageURL) {
                    alert('Please load an image first.');
                    return null;
                }
                const maxDim = 1100;
                const imageCanvas = document.createElement('canvas');
                const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.decoding = 'async';
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error('Failed to load image for grid snap'));
                    img.src = imageURL;
                });

                const srcW = image.width;
                const srcH = image.height;
                const scale = Math.min(1, maxDim / Math.max(1, Math.max(srcW, srcH)));
                const w = Math.max(1, Math.round(srcW * scale));
                const h = Math.max(1, Math.round(srcH * scale));
                imageCanvas.width = w;
                imageCanvas.height = h;
                const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) throw new Error('Failed to create canvas context for grid snap');
                ctx.drawImage(image, 0, 0, w, h);

                const detectionHints = await loadDetectionHints();
                const detected =
                    (await detectDeterministicGridWithTraining(imageCanvas, {
                        useCurrentCounts: true,
                        currentRows: rows,
                        currentCols: cols,
                        hints: detectionHints,
                    })) ??
                    detectGridLines(imageCanvas, true, rows, cols, detectionHints);
                if (!detected) {
                    alert('Snap failed. Try adjusting the crop so the board edges are cleaner.');
                    return null;
                }

                const scaleBackX = srcW / Math.max(1, imageCanvas.width);
                const scaleBackY = srcH / Math.max(1, imageCanvas.height);
                const result = {
                    ...detected,
                    offsetX: detected.offsetX * scaleBackX,
                    offsetY: detected.offsetY * scaleBackY,
                    cellWidth: detected.cellWidth * scaleBackX,
                    cellHeight: detected.cellHeight * scaleBackY,
                };

                setLastGridDetection(result);
                pushUndoSnapshot();

                const nextOffsetX = Math.max(0, Math.min(srcW - 1, Math.round(result.offsetX)));
                const nextOffsetY = Math.max(0, Math.min(srcH - 1, Math.round(result.offsetY)));
                const nextFrameWidth = Math.min(srcW, Math.max(1, Math.round(result.cellWidth * cols)));
                const nextFrameHeight = Math.min(srcH, Math.max(1, Math.round(result.cellHeight * rows)));

                setGridOffsetX(nextOffsetX);
                setGridOffsetY(nextOffsetY);
                setGridFrameWidth(nextFrameWidth);
                setGridFrameHeight(nextFrameHeight);
                setIsSaved(false);
                return result;
            } catch (error) {
                console.error('❌ Snap failed:', error);
                alert(`Snap failed: ${(error as Error).message}`);
                return null;
            }
        };

        const detectCells = async () => {
            console.log('🔍 detectCells() called - OPTIMIZED VERSION');
            setLockImageAspect(false);
            if (!imageURL) {
                console.error('❌ No image in detectCells');
                alert('Please load an image first');
                return;
            }

            try {
                const trainingSet = await getMapperTrainingSet();
                const storedRefs = getStoredCellReferences();
                const cacheKey =
                    `${storedRefs.map((r) => `${r.id}:${r.tileType}:${r.timestamp}`).join('|')}` +
                    `|train:${trainingSet.learnedLevels.join(',')}:${trainingSet.signatures.length}`;
                let refSigs: TileSignature[] = [];
                const cached = referenceSigCacheRef.current;
                if (cached && cached.key === cacheKey) {
                    refSigs = cached.refs;
                } else {
                    refSigs.push(...trainingSet.signatures);
                    for (const ref of storedRefs) {
                        const img = await loadImageData(ref.imageData);
                        if (!img) continue;
                        refSigs.push({
                            ...createTileSignatureFromImageData(img),
                            tileType: ref.tileType,
                        });
                    }
                    referenceSigCacheRef.current = { key: cacheKey, refs: refSigs };
                }

                if (refSigs.length === 0) {
                    alert('No learned references are available yet. Save a few corrected levels first, or add manual reference sprites.');
                    return;
                }

                const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error('Failed to load image for cell detection'));
                    img.src = imageURL;
                });

                const sampleCanvas = document.createElement('canvas');
                sampleCanvas.width = image.width;
                sampleCanvas.height = image.height;
                const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) {
                    console.error('❌ No offscreen canvas context');
                    return;
                }

                ctx.drawImage(image, 0, 0);
                const imageData = ctx.getImageData(0, 0, image.width, image.height);
                const data = imageData.data;
                let activeGridOffsetX = gridOffsetX;
                let activeGridOffsetY = gridOffsetY;
                let activeGridFrameWidth = gridFrameWidth ?? image.width;
                let activeGridFrameHeight = gridFrameHeight ?? image.height;

                const detectionHints = await loadDetectionHints();
                const lockedFit = await detectDeterministicGridWithTraining(sampleCanvas, {
                    useCurrentCounts: true,
                    currentRows: rows,
                    currentCols: cols,
                    hints: detectionHints,
                });

                if (lockedFit) {
                    activeGridOffsetX = Math.max(0, Math.min(image.width - 1, Math.round(lockedFit.offsetX)));
                    activeGridOffsetY = Math.max(0, Math.min(image.height - 1, Math.round(lockedFit.offsetY)));
                    activeGridFrameWidth = Math.min(image.width, Math.max(1, Math.round(lockedFit.cellWidth * cols)));
                    activeGridFrameHeight = Math.min(image.height, Math.max(1, Math.round(lockedFit.cellHeight * rows)));
                    setGridOffsetX(activeGridOffsetX);
                    setGridOffsetY(activeGridOffsetY);
                    setGridFrameWidth(activeGridFrameWidth);
                    setGridFrameHeight(activeGridFrameHeight);
                    setLastGridDetection(lockedFit);
                    setIsSaved(false);
                }

                const cellWidth = activeGridFrameWidth / cols;
                const cellHeight = activeGridFrameHeight / rows;
                console.log(`📊 Image size: ${image.width}x${image.height}, Grid: ${rows}x${cols}, Frame: ${activeGridFrameWidth}x${activeGridFrameHeight}`);

                const gridAllVoid = grid.every((row) => row.every((cell) => cell === 5));
                const gridAllFloor = grid.length > 0 && grid.every((row) => row.every((cell) => cell === 0));
                const overwriteAll = gridAllVoid || gridAllFloor;

                // If the grid is clearly a placeholder (all void or all floor), overwrite everything.
                // Otherwise, be conservative and fill only unknown/void cells so we don't overwrite manual fixes.
                const newGrid: number[][] = overwriteAll ? voidGrid(rows, cols) : grid.map((row) => [...row]);
                const totalCells = rows * cols;
                if (totalCells > MAX_AUTO_DETECT_CELLS) {
                    throw new Error(`Unsafe auto-detect size ${rows}x${cols}. Reduce rows/cols or re-run grid detection with cleaner borders.`);
                }
                let processedCells = 0;

                const classifyCellFast = (x0: number, y0: number, x1: number, y1: number): number => {
                    const signature = createTileSignatureFromRegion(data, image.width, image.height, x0, y0, x1, y1);
                    let bestType: number | null = null;
                    let bestSimilarity = Number.NEGATIVE_INFINITY;
                    for (const ref of refSigs) {
                        const similarity = tileSignatureSimilarity(signature, ref);
                        if (similarity > bestSimilarity) {
                            bestSimilarity = similarity;
                            bestType = ref.tileType;
                        }
                    }
                    const borderTarget = trainingSet.medianBorderRatio ?? signature.borderRatio;
                    const borderDelta = Math.abs(signature.borderRatio - borderTarget);
                    const minSimilarity = borderDelta > 0.18 ? 0.54 : 0.42;
                    if (bestType !== null && bestSimilarity >= minSimilarity) return bestType;
                    return 5;
                };

                // Process in batches using requestAnimationFrame
                const processBatch = (startCell: number): Promise<void> => {
                    return new Promise((resolve) => {
                        requestAnimationFrame(async () => {
                            const batchSize = 20; // Process 20 cells per frame
                            const endCell = Math.min(startCell + batchSize, totalCells);

                            for (let cellIndex = startCell; cellIndex < endCell; cellIndex++) {
                                const r = Math.floor(cellIndex / cols);
                                const c = cellIndex % cols;

                                if (!overwriteAll && newGrid[r]?.[c] !== 5) {
                                    processedCells++;
                                    continue;
                                }

                                const insetX = Math.min(cellWidth * CELL_SAMPLE_INSET_RATIO, Math.max(1, cellWidth / 4));
                                const insetY = Math.min(cellHeight * CELL_SAMPLE_INSET_RATIO, Math.max(1, cellHeight / 4));
                                const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(activeGridOffsetX + c * cellWidth + insetX)));
                                const x1 = Math.max(x0 + 1, Math.min(image.width, Math.ceil(activeGridOffsetX + (c + 1) * cellWidth - insetX)));
                                const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(activeGridOffsetY + r * cellHeight + insetY)));
                                const y1 = Math.max(y0 + 1, Math.min(image.height, Math.ceil(activeGridOffsetY + (r + 1) * cellHeight - insetY)));

                                newGrid[r][c] = classifyCellFast(x0, y0, x1, y1);
                                processedCells++;
                            }

                            // Log progress every 100 cells
                            if (processedCells % 100 === 0 || processedCells === totalCells) {
                                console.log(`Progress: ${processedCells}/${totalCells} cells (${Math.round(processedCells / totalCells * 100)}%)`);
                            }

                            resolve();
                        });
                    });
                };

                // Process all batches sequentially
                console.log('🚀 Starting batch processing...');
                for (let cellIndex = 0; cellIndex < totalCells; cellIndex += 20) {
                    await processBatch(cellIndex);
                }

                console.log('✅ Detection complete!');
                setUndoStack(s => [...s, grid.map(row => [...row])]);
                setRedoStack([]);
                setIsSaved(false);
                // Do not auto-crop the grid or image here. Cropping is a separate, explicit action in the editor
                // and auto-cropping can cut off islands if detection misses a few edge tiles.
                setGrid(newGrid);

            } catch (error) {
                console.error('❌ Error in detectCells:', error);
                alert(`Detection failed: ${(error as Error).message}`);
            }
        };

        const exportTS = async () => {
            try {
                await exportGridToClipboard(grid);
                alert('Grid copied to clipboard as JSON');
            } catch (error) {
                console.error('Export failed:', error);
                alert('Failed to copy to clipboard');
            }
        };

        const syncJsonInputToGrid = () => {
            setJsonInput(formatGridRowsOneLine(grid));
        };

        const applyJsonInput = () => {
            try {
                const nextGrid = parseGridJson(jsonInput);
                setUndoStack((stack) => [...stack, grid.map((row) => [...row])]);
                setRedoStack([]);
                replaceGridShape(nextGrid);
                setJsonInput(formatGridRowsOneLine(nextGrid));
                alert(`Applied JSON grid: ${nextGrid.length} rows × ${nextGrid[0].length} cols`);
            } catch (error) {
                console.error('Failed to apply JSON grid:', error);
                alert(`Invalid JSON grid: ${(error as Error).message}`);
            }
        };

        const setLoadedSnapshot = (snapshot: {
            levelId?: number | null;
            grid: number[][];
            playerStart: { x: number; y: number } | null;
            provenance?: LevelProvenance;
            theme: ColorTheme | undefined;
            timeLimitSeconds: number | null;
            hud3d?: Hud3DSettings;
            hourglassBonusByCell?: Record<string, number>;
            imageURL: string | null;
            overlayEnabled: boolean;
            overlayOpacity: number;
            overlayStretch: boolean;
            imageScaleX: number;
            imageScaleY: number;
            imageOffsetX?: number;
            imageOffsetY?: number;
            lockImageAspect: boolean;
            zoom: number;
            gridOffsetX: number;
            gridOffsetY: number;
            gridFrameWidth: number | null;
            gridFrameHeight: number | null;
        }) => {
            loadedSnapshotRef.current = {
                ...snapshot,
                imageOffsetX: Number.isFinite(snapshot.imageOffsetX) ? Number(snapshot.imageOffsetX) : 0,
                imageOffsetY: Number.isFinite(snapshot.imageOffsetY) ? Number(snapshot.imageOffsetY) : 0,
                grid: snapshot.grid.map((row) => [...row]),
                playerStart: snapshot.playerStart ? { ...snapshot.playerStart } : null,
                provenance: snapshot.provenance,
                hud3d: normalizeHud3DSettings(snapshot.hud3d),
                hourglassBonusByCell: { ...(snapshot.hourglassBonusByCell ?? {}) },
            };
        };

        const resetToLoadedSnapshot = () => {
            const snapshot = loadedSnapshotRef.current;
            if (!snapshot) {
                alert('No default layout snapshot is available yet for this level.');
                return;
            }

            skipAutoResizeRef.current = true;
            prevSizeRef.current = { rows: snapshot.grid.length, cols: snapshot.grid[0]?.length ?? 0 };
            setRows(snapshot.grid.length);
            setCols(snapshot.grid[0]?.length ?? 0);
            setGrid(snapshot.grid.map((row) => [...row]));
            setPlayerStart(snapshot.playerStart ? { ...snapshot.playerStart } : null);
            setCurrentLevelProvenance(snapshot.provenance);
            setTheme(snapshot.theme);
            setTimeLimitSeconds(snapshot.timeLimitSeconds ?? null);
            setHud3d(normalizeHud3DSettings(snapshot.hud3d));
            setHourglassBonusByCell({ ...(snapshot.hourglassBonusByCell ?? {}) });
            setImageURL(snapshot.imageURL);
            setOverlayEnabled(snapshot.overlayEnabled);
            setOverlayOpacity(snapshot.overlayOpacity);
            setOverlayStretch(snapshot.overlayStretch);
            setImageScaleX(snapshot.imageScaleX);
            setImageScaleY(snapshot.imageScaleY);
            setImageOffsetX(snapshot.imageOffsetX ?? 0);
            setImageOffsetY(snapshot.imageOffsetY ?? 0);
            setLockImageAspect(snapshot.lockImageAspect);
            setZoom(snapshot.zoom);
            setGridOffsetX(snapshot.gridOffsetX);
            setGridOffsetY(snapshot.gridOffsetY);
            setGridFrameWidth(snapshot.gridFrameWidth);
            setGridFrameHeight(snapshot.gridFrameHeight);
            setUndoStack([]);
            setRedoStack([]);
            setIsSaved(true);
        };

        const saveChanges = async (options?: { force?: boolean }) => {
            if (!options?.force) {
                const currentLevelId = importLevelIndex !== null ? allLevels[importLevelIndex]?.id ?? null : null;
                const duplicateWarning = findDuplicateGridWarning(grid, currentLevelId, allLevels);
                if (duplicateWarning) {
                    toast.warning(
                        `This grid is ${duplicateWarning.similarityPct}% identical to level ${duplicateWarning.matchedLevelId}'s map.`,
                        {
                            position: 'bottom-right',
                            duration: 12000,
                            description: currentLevelId != null
                                ? `Saving now would overwrite level ${currentLevelId} with what looks like level ${duplicateWarning.matchedLevelId}'s content (e.g. from navigating to the next level before saving). Double-check before proceeding.`
                                : `Double-check before proceeding.`,
                            action: {
                                label: 'Save Anyway',
                                onClick: () => { void saveChanges({ force: true }); },
                            },
                        }
                    );
                    return;
                }
            }

            if (getAdminMode()) {
                const currentLevelId = importLevelIndex !== null ? allLevels[importLevelIndex]?.id ?? null : null;
                // A native confirm() blocks all JS (including any HMR/page reload) until answered,
                // so it can't be missed the way a toast can when a repo write triggers a reload.
                const confirmed = window.confirm(
                    currentLevelId != null
                        ? `Admin mode is on. Saving now will override the canonical repo default for level ${currentLevelId} if it's locked. Are you sure you want to continue?`
                        : `Admin mode is on. Saving now may override a canonical repo default. Are you sure you want to continue?`
                );
                if (!confirmed) return;
            }

            const nextProvenance: LevelProvenance = 'user-edited';
            const res = saveGridChanges(grid, playerStart, nextProvenance, theme, timeLimitSeconds, hud3d, hourglassBonusByCell, importLevelIndex, allLevels);
            setAllLevels(res.levels);
            // Keep editor state in sync with the *actual* persisted payload (e.g. start-marker cave conversion).
            setGrid(res.gridSaved.map((row) => [...row]));
            setHourglassBonusByCell({ ...(res.hourglassBonusByCellSaved ?? {}) });
            setCurrentLevelProvenance(nextProvenance);
            setIsSaved(true);

            // Persist current overlay tweaks immediately. This avoids a race where a dev-only file write
            // triggers a Vite reload before the effect-based localStorage persistence runs.
            if (res.levelId != null) {
                const savedAt = Date.now();
                saveLevelImageScale(res.levelId, { x: imageScaleX, y: imageScaleY, offsetX: imageOffsetX, offsetY: imageOffsetY, lock: lockImageAspect });
                saveLevelLayoutOverride(res.levelId, rows, cols);
                saveLevelMapperSavedState(res.levelId, {
                    rows,
                    cols,
                    grid: cloneGrid(res.gridSaved),
                    playerStart: playerStart ? { ...playerStart } : null,
                    provenance: nextProvenance,
                    theme,
                    timeLimitSeconds,
                    hud3d,
                    hourglassBonusByCell: { ...(res.hourglassBonusByCellSaved ?? {}) },
                    overlayEnabled,
                    overlayOpacity,
                    overlayStretch,
                    imageScaleX,
                    imageScaleY,
                    overlayScaleBaseY: OVERLAY_IMAGE_SCALE_Y_BASE,
                    imageOffsetX,
                    imageOffsetY,
                    lockImageAspect,
                    zoom,
                    gridOffsetX,
                    gridOffsetY,
                    gridFrameWidth,
                    gridFrameHeight,
                    updatedAt: savedAt,
                });
                saveLevelMapperDraft(res.levelId, {
                    rows,
                    cols,
                    grid: cloneGrid(res.gridSaved),
                    playerStart: playerStart ? { ...playerStart } : null,
                    provenance: nextProvenance,
                    theme,
                    timeLimitSeconds,
                    hud3d,
                    hourglassBonusByCell: { ...(res.hourglassBonusByCellSaved ?? {}) },
                    overlayEnabled,
                    overlayOpacity,
                    overlayStretch,
                    imageScaleX,
                    imageScaleY,
                    imageOffsetX,
                    imageOffsetY,
                    lockImageAspect,
                    zoom,
                    gridOffsetX,
                    gridOffsetY,
                    gridFrameWidth,
                    gridFrameHeight,
                    undoStack: undoStack.slice(-DRAFT_HISTORY_LIMIT).map(cloneHistoryEntry),
                    redoStack: redoStack.slice(-DRAFT_HISTORY_LIMIT).map(cloneHistoryEntry),
                    updatedAt: savedAt,
                });
            }

            // Promote the current editor state (including rows/cols + overlay stretch tweaks) to be the new
            // "default" for this level's Reset Layout. This is what you want when you manually correct
            // the grid height/shape and then save.
            setLoadedSnapshot({
                levelId: res.levelId,
                grid: res.gridSaved,
                playerStart,
                provenance: nextProvenance,
                theme,
                timeLimitSeconds,
                hud3d,
                hourglassBonusByCell: res.hourglassBonusByCellSaved,
                imageURL,
                overlayEnabled,
                overlayOpacity,
                overlayStretch,
                imageScaleX,
                imageScaleY,
                imageOffsetX,
                imageOffsetY,
                lockImageAspect,
                zoom,
                gridOffsetX,
                gridOffsetY,
                gridFrameWidth,
                gridFrameHeight,
            });

            // Force the compare level to update by triggering a re-render
            if (compareLevelIndex !== null) {
                setCompareLevelIndex(compareLevelIndex);
            }

            // Dev-only: promote mapper saves into repo defaults (src/data/promoted-levels.json) so builds
            // use your manual corrections as the default level data.
            let repoDefaultStatus: 'saved' | 'unavailable' | 'failed' | 'skipped' = 'skipped';
            let repoDefaultMessage = '';

            if (import.meta.env.DEV && res.override === 'saved' && res.levelId != null) {
                const levelId = res.levelId;
                const writerUrl = (import.meta.env.VITE_LEVEL_WRITER_URL as string | undefined) ?? 'http://localhost:8787/write-level-default';
                const findCavePos = (g: number[][]) => {
                    for (let y = 0; y < g.length; y += 1) {
                        for (let x = 0; x < (g[y]?.length ?? 0); x += 1) {
                            if (g[y][x] === 3) return { x, y };
                        }
                    }
                    // Fallback; gameplay will still resync cavePos from the grid.
                    return { x: 0, y: 0 };
                };

                const payload: Record<string, unknown> = {
                    grid: res.gridSaved,
                    playerStart: playerStart ?? { x: 0, y: 0 },
                    cavePos: findCavePos(res.gridSaved),
                    provenance: nextProvenance,
                };
                if (theme !== undefined) payload.theme = theme;
                if (timeLimitSeconds != null && Number.isFinite(timeLimitSeconds) && timeLimitSeconds > 0) {
                    payload.timeLimitSeconds = Math.round(timeLimitSeconds);
                }
                payload.hud3d = normalizeHud3DSettings(hud3d);
                if (res.hourglassBonusByCellSaved && Object.keys(res.hourglassBonusByCellSaved).length > 0) {
                    payload.hourglassBonusByCell = res.hourglassBonusByCellSaved;
                }

                try {
                    // Admin mode is an explicit "I know what I'm doing" signal, so let Save push through
                    // a locked level's repo default without a separate console script.
                    const forceQuery = getAdminMode() ? '&force=1' : '';
                    const response = await fetch(`${writerUrl}?id=${levelId}&overwrite=1${forceQuery}`, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify(payload),
                    });

                    if (response.ok) {
                        repoDefaultStatus = 'saved';
                    } else {
                        const body = await response.json().catch(() => null);
                        repoDefaultStatus = 'failed';
                        repoDefaultMessage =
                            typeof body?.error === 'string'
                                ? body.error
                                : `asset-writer responded with ${response.status}`;
                    }
                } catch (err) {
                    console.warn('level-default writer not available (skipping):', err);
                    repoDefaultStatus = 'unavailable';
                }
            }

            setLastSavedAt(Date.now());
            setLastSavedRepoStatus(repoDefaultStatus === 'skipped' ? null : repoDefaultStatus);

            if (res.override === 'cleared' && res.levelId != null) {
                toast.info(`Grid is empty. Cleared level ${res.levelId} override and reverted to its default map.`, {
                    position: 'bottom-right',
                    duration: 4500,
                });
            } else if (res.override === 'saved' && res.levelId != null) {
                if (repoDefaultStatus === 'saved') {
                    toast.success(`Changes saved for level ${res.levelId}. Repo default updated.`, {
                        position: 'bottom-right',
                        duration: 4200,
                        description: 'asset-writer is running, so builds will use this updated default.',
                    });
                } else if (repoDefaultStatus === 'failed') {
                    toast.warning(`Changes saved for level ${res.levelId}. Repo default was not updated.`, {
                        position: 'bottom-right',
                        duration: 5200,
                        description: repoDefaultMessage,
                    });
                } else if (repoDefaultStatus === 'unavailable') {
                    toast.success(`Changes saved for level ${res.levelId}.`, {
                        position: 'bottom-right',
                        duration: 5200,
                        description: 'asset-writer was not detected, so only the browser-local mapper/game override was saved.',
                    });
                } else {
                    toast.success(`Changes saved for level ${res.levelId}.`, {
                        position: 'bottom-right',
                        duration: 4000,
                    });
                }
            } else {
                toast.success('Changes saved!', {
                    position: 'bottom-right',
                    duration: 3500,
                });
            }

            invalidateMapperTrainingSetCache();
        };

        const pushUndo = () => { setUndoStack(s => [...s, grid.map(r => [...r])]); setRedoStack([]); setIsSaved(false); };
        const replaceGridShape = (nextGrid: number[][]) => {
            const nextRows = nextGrid.length;
            const nextCols = nextGrid[0]?.length ?? 0;
            skipAutoResizeRef.current = true;
            prevSizeRef.current = { rows: nextRows, cols: nextCols };
            setRows(nextRows);
            setCols(nextCols);
            setGrid(nextGrid.map((row) => [...row]));
            setIsSaved(false);
        };

        console.log('✓ Creating context value...');
        const value: LevelMapperContextValue = {
            rows,
            cols,
            setRows,
            setCols,
            grid,
            setGrid,
            activeTile,
            setActiveTile,
            hourglassBonusByCell,
            setHourglassBonusByCell,
            hourglassBrushSeconds,
            setHourglassBrushSeconds,
            playerStart,
            currentLevelProvenance,
            setPlayerStart,
            theme,
            setTheme,
            timeLimitSeconds,
            setTimeLimitSeconds,
            hud3d,
            setHud3d,
            imageURL,
            setImageURL,
            canvasRef,
            zoom,
            setZoom,
            gridOffsetX,
            setGridOffsetX,
            gridOffsetY,
            setGridOffsetY,
            gridFrameWidth,
            setGridFrameWidth,
            gridFrameHeight,
            setGridFrameHeight,
            showGrid,
            setShowGrid,
            overlayEnabled,
            setOverlayEnabled,
            overlayOpacity,
            setOverlayOpacity,
            overlayStretch,
            setOverlayStretch,
            imageScaleX,
            setImageScaleX,
            imageScaleY,
            setImageScaleY,
            imageOffsetX,
            setImageOffsetX,
            imageOffsetY,
            setImageOffsetY,
            lockImageAspect,
            setLockImageAspect,
            allLevels,
            setAllLevels,
            compareLevelIndex,
            setCompareLevelIndex,
            compareLevel,
            importLevelIndex,
            setImportLevelIndex,
            undo,
            redo,
            canUndo: undoStack.length > 0,
            canRedo: redoStack.length > 0,
            isSaved,
            setIsSaved,
            lastSavedAt,
            lastSavedRepoStatus,
            saveChanges,
            showUnsavedBanner,
            restoreDraftForLevel,
            detectGrid,
            snapToLockedCounts,
            detectCells,
            lastGridDetection,
            contextMenu,
            setContextMenu,
            addMultipleColumns,
            addMultipleRows,
            addColumnLeft,
            addColumnRight,
            addRowTop,
            addRowBottom,
            removeColumnLeft,
            removeColumnRight,
            removeRowTop,
            removeRowBottom,
            exportTS,
            jsonInput,
            setJsonInput,
            syncJsonInputToGrid,
            applyJsonInput,
            setLoadedSnapshot,
            resetToLoadedSnapshot,
            pushUndo,
            pushUndoSnapshot,
            replaceGridShape,
        };

        console.log('✅ LevelMapperProvider ready');
        return <LevelMapperContext.Provider value={value}>{children}</LevelMapperContext.Provider>;
};

console.log('✅ LevelMapperContext.tsx loaded');
