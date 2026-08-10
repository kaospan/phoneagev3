import { getAllLevels, isPlaceholderGrid, normalizeHud3DSettings, type ColorTheme, type Hud3DSettings, type LevelProvenance } from '@/data/levels';
import { notifyLevelOverridesUpdated } from '@/lib/levelOverrides';
import {
    LEVEL_IMAGE_SCALE_STORAGE_VERSION,
    OVERLAY_IMAGE_SCALE_Y_BASE,
    normalizeOverlayUserScaleY,
} from './overlayDefaults';
import type { LevelMapperDraft, LevelMapperSavedState } from './LevelMapperStore';

/**
 * Persistence operations for level mapper
 * Handles save/load operations and export functionality
 * @author Level Mapper Team
 */

/**
 * Saves the current grid, player start position, and theme to localStorage
 * @param grid - The current grid state
 * @param playerStart - The player starting position (if any)
 * @param theme - The color theme for the level (if any)
 * @param timeLimitSeconds - Optional per-level countdown timer in seconds (null disables)
 * @param hud3d - Per-level 3D HUD status bar visibility settings
 * @param hourglassBonusByCell - Optional per-cell hourglass bonuses keyed by "x,y" (column,row)
 * @param importLevelIndex - Index of the imported level (if any)
 * @param allLevels - Array of all available levels
 * @returns Updated levels array after save
 */
export const saveGridChanges = (
    grid: number[][],
    playerStart: { x: number; y: number } | null,
    provenance: LevelProvenance | undefined,
    theme: ColorTheme | undefined,
    timeLimitSeconds: number | null,
    hud3d: Hud3DSettings,
    hourglassBonusByCell: Record<string, number>,
    importLevelIndex: number | null,
    allLevels: ReturnType<typeof getAllLevels>
): {
    levels: ReturnType<typeof getAllLevels>;
    override: 'saved' | 'cleared' | 'none';
    levelId: number | null;
    gridSaved: number[][];
    hourglassBonusByCellSaved: Record<string, number>;
} => {
    // If the player start was mistakenly painted as the goal cave (3), convert it to the non-goal
    // start-marker cave (18) so reaching it does nothing and cavePos detection stays correct.
    const gridToSave = (() => {
        if (!playerStart) return grid;
        const row = grid[playerStart.y];
        if (!row) return grid;
        const startCell = row[playerStart.x];
        // If start is plain floor, store it as a start-marker cave for nostalgia (walkable, non-goal).
        if (startCell === 0) {
            const next = grid.map((r) => r.slice());
            next[playerStart.y][playerStart.x] = 18;
            return next;
        }
        if (startCell !== 3) return grid;

        let hasOtherCave = false;
        for (let y = 0; y < grid.length && !hasOtherCave; y += 1) {
            for (let x = 0; x < (grid[y]?.length ?? 0); x += 1) {
                if (x === playerStart.x && y === playerStart.y) continue;
                if (grid[y][x] === 3) {
                    hasOtherCave = true;
                    break;
                }
            }
        }
        if (!hasOtherCave) return grid;

        const next = grid.map((r) => r.slice());
        next[playerStart.y][playerStart.x] = 18;
        return next;
    })();

    const sanitizeHourglassBonusByCell = (value: Record<string, number>, gridToCheck: number[][]) => {
        const out: Record<string, number> = {};
        for (const [key, raw] of Object.entries(value ?? {})) {
            const parts = key.split(',');
            if (parts.length !== 2) continue;
            const x = Number(parts[0]);
            const y = Number(parts[1]);
            if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
            if (y < 0 || y >= gridToCheck.length) continue;
            if (x < 0 || x >= (gridToCheck[0]?.length ?? 0)) continue;
            if (gridToCheck[y]?.[x] !== 20) continue;
            const n = Number(raw);
            if (!Number.isFinite(n)) continue;
            out[`${x},${y}`] = Math.max(1, Math.min(86400, Math.round(n)));
        }
        return out;
    };

    const hourglassToSave = sanitizeHourglassBonusByCell(hourglassBonusByCell, gridToSave);

    // Merge with any existing override payload to avoid erasing newer fields added over time.
    const existingOverrideForLevel = (levelId: number): Record<string, unknown> | null => {
        try {
            const raw = localStorage.getItem(`level_override_${levelId}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as unknown;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            return parsed as Record<string, unknown>;
        } catch {
            return null;
        }
    };

    const dataToSaveForLevel = (levelId: number) => {
        const prev = existingOverrideForLevel(levelId);
        const payload: Record<string, unknown> = {
            ...(prev ?? {}),
            grid: gridToSave,
            playerStart,
            provenance: provenance ?? 'user-edited',
            ...(theme !== undefined ? { theme } : {}),
            // Preserve semantics: null means "no timer".
            timeLimitSeconds,
            hud3d: normalizeHud3DSettings(hud3d),
        };

        if (Object.keys(hourglassToSave).length > 0) {
            payload.hourglassBonusByCell = hourglassToSave;
        } else {
            delete payload.hourglassBonusByCell;
        }

        return payload;
    };

    let override: 'saved' | 'cleared' | 'none' = 'none';
    let levelId: number | null = null;
    
    // Save override for specific level if one is imported
    if (importLevelIndex !== null) {
        const lvl = allLevels[importLevelIndex];
        if (lvl) {
            levelId = lvl.id;

            // Guardrail: don't accidentally override a real level with a placeholder/empty grid.
            // This is the most common root cause of "level N is all void" even though N.png exists.
            const nextIsPlaceholder = isPlaceholderGrid(gridToSave);
            const prevIsPlaceholder = isPlaceholderGrid(lvl.grid);
            const key = `level_override_${lvl.id}`;
            if (nextIsPlaceholder && !prevIsPlaceholder) {
                localStorage.removeItem(key);
                override = 'cleared';
                notifyLevelOverridesUpdated();
            } else {
                localStorage.setItem(key, JSON.stringify(dataToSaveForLevel(lvl.id)));
                override = 'saved';
                notifyLevelOverridesUpdated();
            }
        }
    }
    
    // Always save to general mapper storage
    localStorage.setItem('levelmapper_grid', JSON.stringify(gridToSave));
    if (Object.keys(hourglassToSave).length > 0) {
        localStorage.setItem('levelmapper_hourglassBonusByCell', JSON.stringify(hourglassToSave));
    } else {
        localStorage.removeItem('levelmapper_hourglassBonusByCell');
    }
    if (playerStart) {
        localStorage.setItem('levelmapper_playerStart', JSON.stringify(playerStart));
    }
    if (theme) {
        localStorage.setItem('levelmapper_theme', theme);
    }
    if (timeLimitSeconds != null && Number.isFinite(timeLimitSeconds)) {
        localStorage.setItem('levelmapper_timeLimitSeconds', String(Math.max(0, Math.round(timeLimitSeconds))));
    } else {
        localStorage.removeItem('levelmapper_timeLimitSeconds');
    }
    
    // Reload and return updated levels
    return {
        levels: getAllLevels(),
        override,
        levelId,
        gridSaved: gridToSave,
        hourglassBonusByCellSaved: hourglassToSave,
    };
};

const LEVEL_LAYOUT_OVERRIDE_PREFIX = 'level_layout_override_';
const LEVEL_IMAGE_SCALE_PREFIX = 'level_mapper_image_scale_';
const LEVEL_MAPPER_DRAFT_PREFIX = 'level_mapper_draft_';
const LEVEL_MAPPER_SAVED_PREFIX = 'level_mapper_saved_';

export const saveLevelLayoutOverride = (levelId: number, rows: number, cols: number): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(`${LEVEL_LAYOUT_OVERRIDE_PREFIX}${levelId}`, JSON.stringify({ rows, cols }));
    } catch {
        // ignore
    }
};

export const loadLevelLayoutOverride = (levelId: number): { rows: number; cols: number } | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(`${LEVEL_LAYOUT_OVERRIDE_PREFIX}${levelId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') return null;
        const layout = parsed as Partial<{ rows: unknown; cols: unknown }>;
        const rows = Number(layout.rows);
        const cols = Number(layout.cols);
        if (!Number.isFinite(rows) || !Number.isFinite(cols)) return null;
        if (!Number.isInteger(rows) || !Number.isInteger(cols)) return null;
        if (rows <= 0 || cols <= 0) return null;
        return { rows, cols };
    } catch {
        return null;
    }
};

export type LevelImageScale = {
    x: number;
    // User-facing Y adjustment factor (1.0 = baseline).
    // Effective Y scale = y * OVERLAY_IMAGE_SCALE_Y_BASE
    y: number;
    lock: boolean;
    offsetX?: number;
    offsetY?: number;
    // Optional versioning for future migrations.
    v?: number;
    baseY?: number;
};

export const loadLevelImageScale = (levelId: number): LevelImageScale | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(`${LEVEL_IMAGE_SCALE_PREFIX}${levelId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') return null;
        const scale = parsed as Partial<Record<keyof LevelImageScale, unknown>>;
        const x = Number(scale.x ?? 1);
        const yRaw = Number(scale.y ?? 1);
        const offsetX = Number(scale.offsetX ?? 0);
        const offsetY = Number(scale.offsetY ?? 0);
        const lock = Boolean(scale.lock ?? false);
        const v = Number(scale.v ?? 1);
        if (!Number.isFinite(x) || !Number.isFinite(yRaw)) return null;

        // v1 stored the effective Y scale directly.
        // v2+ stores user-facing adjustment plus the baseline used at save time.
        const storedBaseY = Number(scale.baseY);
        const y =
            v <= 1
                ? yRaw / Math.max(1e-6, OVERLAY_IMAGE_SCALE_Y_BASE)
                : normalizeOverlayUserScaleY(yRaw, storedBaseY);

        // Entries saved before v6 (the factory-defaults era) with y close to the old
        // uncalibrated default (≤93.5%) are treated as never explicitly set. Return null
        // so the caller falls back to the factory calibration (1.0 = 100%).
        if (v < 6 && y <= 0.935) return null;

        return {
            x,
            y,
            lock,
            offsetX: Number.isFinite(offsetX) ? offsetX : 0,
            offsetY: Number.isFinite(offsetY) ? offsetY : 0,
            v: LEVEL_IMAGE_SCALE_STORAGE_VERSION,
            baseY: OVERLAY_IMAGE_SCALE_Y_BASE,
        };
    } catch {
        return null;
    }
};

export const saveLevelImageScale = (levelId: number, value: LevelImageScale): void => {
    if (typeof window === 'undefined') return;
    try {
        const out: LevelImageScale = {
            ...value,
            v: LEVEL_IMAGE_SCALE_STORAGE_VERSION,
            baseY: OVERLAY_IMAGE_SCALE_Y_BASE,
        };
        localStorage.setItem(`${LEVEL_IMAGE_SCALE_PREFIX}${levelId}`, JSON.stringify(out));
    } catch {
        // ignore
    }
};

export const saveLevelMapperDraft = (levelId: number, draft: LevelMapperDraft): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(`${LEVEL_MAPPER_DRAFT_PREFIX}${levelId}`, JSON.stringify(draft));
    } catch {
        // ignore
    }
};

export const loadLevelMapperDraft = (levelId: number): LevelMapperDraft | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(`${LEVEL_MAPPER_DRAFT_PREFIX}${levelId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const maybeDraft = parsed as Partial<LevelMapperDraft>;
        if (!Array.isArray(maybeDraft.grid) || maybeDraft.grid.length === 0) return null;
        return maybeDraft as LevelMapperDraft;
    } catch {
        return null;
    }
};

export const saveLevelMapperSavedState = (levelId: number, savedState: LevelMapperSavedState): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(`${LEVEL_MAPPER_SAVED_PREFIX}${levelId}`, JSON.stringify(savedState));
    } catch {
        // ignore
    }
};

export const loadLevelMapperSavedState = (levelId: number): LevelMapperSavedState | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(`${LEVEL_MAPPER_SAVED_PREFIX}${levelId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const maybeState = parsed as Partial<LevelMapperSavedState>;
        if (!Array.isArray(maybeState.grid) || maybeState.grid.length === 0) return null;
        return maybeState as LevelMapperSavedState;
    } catch {
        return null;
    }
};

export const clearLevelMapperDraft = (levelId: number): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(`${LEVEL_MAPPER_DRAFT_PREFIX}${levelId}`);
    } catch {
        // ignore
    }
};

/**
 * Exports the current grid as JSON to clipboard
 * @param grid - The grid to export
 * @throws Error if clipboard write fails
 */
export const exportGridToClipboard = async (grid: number[][]): Promise<void> => {
    const txt = JSON.stringify(grid);
    await navigator.clipboard.writeText(txt);
};

/**
 * Loads compare level index from localStorage
 * @returns Saved compare level index or 0 as default
 */
export const loadCompareLevelIndex = (): number => {
    const saved = localStorage.getItem('levelmapper-compare-level');
    return saved ? parseInt(saved, 10) : 0;
};

/**
 * Saves compare level index to localStorage
 * @param index - The level index to save
 */
export const saveCompareLevelIndex = (index: number): void => {
    localStorage.setItem('levelmapper-compare-level', index.toString());
};

/**
 * Loads import level index from localStorage
 * @returns Saved import level index or null
 */
export const loadImportLevelIndex = (): number | null => {
    const saved = localStorage.getItem('levelmapper-import-level');
    return saved ? parseInt(saved, 10) : null;
};

/**
 * Saves import level index to localStorage
 * @param index - The level index to save
 */
export const saveImportLevelIndex = (index: number): void => {
    localStorage.setItem('levelmapper-import-level', index.toString());
};

/**
 * Clears import level from localStorage
 */
export const clearImportLevel = (): void => {
    localStorage.removeItem('levelmapper-import-level');
};
