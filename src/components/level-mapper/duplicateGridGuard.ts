/**
 * Detects when a grid about to be saved for one level is suspiciously similar to a
 * *different* level's grid — the signature of an off-by-one save (e.g. saving level N+1's
 * content under level N while navigating sequentially through the mapper).
 */

const DUPLICATE_SIMILARITY_THRESHOLD_PCT = 85;
const MIN_NON_VOID_CELLS_TO_CHECK = 5;
const VOID_CELL = 5;

export type DuplicateGridWarning = {
    matchedLevelId: number;
    similarityPct: number;
};

const gridSimilarityPct = (gridA: number[][], gridB: number[][]): number => {
    const rows = Math.max(gridA.length, gridB.length);
    let diff = 0;
    let total = 0;
    for (let y = 0; y < rows; y += 1) {
        const rowA = gridA[y] ?? [];
        const rowB = gridB[y] ?? [];
        const cols = Math.max(rowA.length, rowB.length, 1);
        for (let x = 0; x < cols; x += 1) {
            total += 1;
            if ((rowA[x] ?? -1) !== (rowB[x] ?? -1)) diff += 1;
        }
    }
    return total === 0 ? 0 : ((total - diff) / total) * 100;
};

export const findDuplicateGridWarning = (
    grid: number[][],
    currentLevelId: number | null,
    allLevels: Array<{ id: number; grid: number[][] }>
): DuplicateGridWarning | null => {
    const nonVoidCount = grid.reduce((n, row) => n + row.filter((cell) => cell !== VOID_CELL).length, 0);
    if (nonVoidCount < MIN_NON_VOID_CELLS_TO_CHECK) return null;

    let best: DuplicateGridWarning | null = null;
    for (const lvl of allLevels) {
        if (lvl.id === currentLevelId) continue;
        if (!Array.isArray(lvl.grid) || lvl.grid.length === 0) continue;
        const pct = gridSimilarityPct(grid, lvl.grid);
        if (pct >= DUPLICATE_SIMILARITY_THRESHOLD_PCT && (!best || pct > best.similarityPct)) {
            best = { matchedLevelId: lvl.id, similarityPct: Math.round(pct * 10) / 10 };
        }
    }
    return best;
};
