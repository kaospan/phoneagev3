import { appendCellReferences, type CellReference } from '@/lib/spriteMatching';
import { assessSingleCellReference } from './referenceQuality';

export interface GridFrame {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
}

interface LearnFromMapOptions {
    imageURL: string;
    grid: number[][];
    frame: GridFrame;
    levelLabel?: string;
    maxPerType?: number;
    /**
     * Optional trusted positions (row,col) that the user manually verified/painted.
     * When provided and non-empty, learning will ONLY sample sprites from these cells.
     * Format: "row,col".
     */
    trustedCells?: string[];
}

interface CropOuterVoidOptions {
    grid: number[][];
    keepMargin?: number;
    playerStart: { x: number; y: number } | null;
    frame: GridFrame;
}

interface CropOuterVoidResult {
    grid: number[][];
    rows: number;
    cols: number;
    playerStart: { x: number; y: number } | null;
    frame: GridFrame;
    removed: { top: number; right: number; bottom: number; left: number };
}

const loadImage = async (imageURL: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${imageURL}`));
        image.src = imageURL;
    });
};

// Trim inward so saved sprites don't include gridlines or neighbor-cell bleed.
const LEARN_SAMPLE_INSET_RATIO = 0.12;

const isBoundarySample = (grid: number[][], row: number, col: number, tileType: number) => {
    const neighbors = [
        grid[row - 1]?.[col],
        grid[row + 1]?.[col],
        grid[row]?.[col - 1],
        grid[row]?.[col + 1],
    ];

    if (tileType === 5) {
        return neighbors.some((neighbor) => neighbor !== undefined && neighbor !== 5);
    }

    return neighbors.some((neighbor) => neighbor === undefined || neighbor !== tileType);
};

const boundaryPenalty = (grid: number[][], row: number, col: number, tileType: number) => {
    const neighbors = [
        grid[row - 1]?.[col],
        grid[row + 1]?.[col],
        grid[row]?.[col - 1],
        grid[row]?.[col + 1],
    ];

    if (tileType === 5) {
        return neighbors.filter((neighbor) => neighbor !== undefined && neighbor !== 5).length;
    }

    return neighbors.filter((neighbor) => neighbor === undefined || neighbor !== tileType).length;
};

const selectRepresentativeCells = (
    grid: number[][],
    positions: Array<{ row: number; col: number }>,
    tileType: number,
    limit: number
) => {
    // Prefer "interior" samples (clean single-tile crops) over boundary ones.
    const ranked = [...positions]
        .map((p) => ({ ...p, penalty: boundaryPenalty(grid, p.row, p.col, tileType) }))
        .sort((a, b) => {
            if (a.penalty !== b.penalty) return a.penalty - b.penalty;
            if (a.row !== b.row) return a.row - b.row;
            return a.col - b.col;
        });

    const interior = ranked.filter((p) => p.penalty === 0);
    const pool = interior.length >= Math.min(limit, 3) ? interior : ranked;

    if (pool.length <= limit) {
        return pool.map(({ row, col }) => ({ row, col }));
    }

    const selected: Array<{ row: number; col: number }> = [];
    const step = pool.length / limit;
    for (let index = 0; index < limit; index += 1) {
        const item = pool[Math.min(pool.length - 1, Math.floor(index * step))];
        selected.push({ row: item.row, col: item.col });
    }
    return selected;
};

export const learnReferencesFromAlignedMap = async ({
    imageURL,
    grid,
    frame,
    levelLabel,
    maxPerType = 8,
    trustedCells,
}: LearnFromMapOptions): Promise<number> => {
    const image = await loadImage(imageURL);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Failed to create learning canvas');
    }

    context.drawImage(image, 0, 0);

    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    if (rows === 0 || cols === 0) {
        return 0;
    }

    const cellWidth = frame.width / cols;
    const cellHeight = frame.height / rows;
    const positionsByType = new Map<number, Array<{ row: number; col: number }>>();
    const trusted = trustedCells && trustedCells.length ? new Set(trustedCells) : null;

    grid.forEach((row, rowIndex) => {
        row.forEach((tileType, colIndex) => {
            if (trusted && !trusted.has(`${rowIndex},${colIndex}`)) return;
            const positions = positionsByType.get(tileType) ?? [];
            positions.push({ row: rowIndex, col: colIndex });
            positionsByType.set(tileType, positions);
        });
    });

    const references: CellReference[] = [];

    positionsByType.forEach((positions, tileType) => {
        // Never learn/save Void sprites as references.
        if (tileType === 5) return;
        const selected = selectRepresentativeCells(grid, positions, tileType, maxPerType);
        selected.forEach(({ row, col }, index) => {
            const tryCrop = (insetRatio: number) => {
                const insetX = Math.min(cellWidth * insetRatio, Math.max(1, cellWidth / 4));
                const insetY = Math.min(cellHeight * insetRatio, Math.max(1, cellHeight / 4));

                const x0 = Math.max(0, Math.min(canvas.width - 1, Math.floor(frame.offsetX + col * cellWidth + insetX)));
                const y0 = Math.max(0, Math.min(canvas.height - 1, Math.floor(frame.offsetY + row * cellHeight + insetY)));
                const x1 = Math.max(x0 + 1, Math.min(canvas.width, Math.ceil(frame.offsetX + (col + 1) * cellWidth - insetX)));
                const y1 = Math.max(y0 + 1, Math.min(canvas.height, Math.ceil(frame.offsetY + (row + 1) * cellHeight - insetY)));

                const sw = Math.max(1, x1 - x0);
                const sh = Math.max(1, y1 - y0);

                const sampleCanvas = document.createElement('canvas');
                sampleCanvas.width = sw;
                sampleCanvas.height = sh;
                const sampleContext = sampleCanvas.getContext('2d');
                if (!sampleContext) {
                    return null;
                }

                sampleContext.imageSmoothingEnabled = false;
                sampleContext.drawImage(canvas, x0, y0, sw, sh, 0, 0, sw, sh);

                try {
                    const imgData = sampleContext.getImageData(0, 0, sw, sh);
                    const quality = assessSingleCellReference(imgData);
                    if (!quality.ok) return null;
                } catch {
                    // If getImageData fails, don't block saving.
                }

                return sampleCanvas.toDataURL('image/png');
            };

            // First attempt uses the normal inset; second attempt is more aggressive to avoid border bleed.
            const imageData = tryCrop(LEARN_SAMPLE_INSET_RATIO) ?? tryCrop(Math.min(0.22, LEARN_SAMPLE_INSET_RATIO + 0.1));
            if (!imageData) return;

            references.push({
                id: `learn-${Date.now()}-${tileType}-${row}-${col}-${index}`,
                tileType,
                imageData,
                timestamp: Date.now() + index,
                gridPosition: { row, col },
                sourceName: levelLabel ?? 'mapper-learned',
            });
        });
    });

    appendCellReferences(references);
    return references.length;
};

export const cropOuterVoidCells = ({
    grid,
    keepMargin = 3,
    playerStart,
    frame,
}: CropOuterVoidOptions): CropOuterVoidResult => {
    let minRow = Number.POSITIVE_INFINITY;
    let maxRow = Number.NEGATIVE_INFINITY;
    let minCol = Number.POSITIVE_INFINITY;
    let maxCol = Number.NEGATIVE_INFINITY;

    grid.forEach((row, rowIndex) => {
        row.forEach((cell, colIndex) => {
            if (cell !== 5) {
                minRow = Math.min(minRow, rowIndex);
                maxRow = Math.max(maxRow, rowIndex);
                minCol = Math.min(minCol, colIndex);
                maxCol = Math.max(maxCol, colIndex);
            }
        });
    });

    if (!Number.isFinite(minRow) || !Number.isFinite(minCol)) {
        return {
            grid,
            rows: grid.length,
            cols: grid[0]?.length ?? 0,
            playerStart,
            frame,
            removed: { top: 0, right: 0, bottom: 0, left: 0 },
        };
    }

    const cropTop = Math.max(0, minRow - keepMargin);
    const cropLeft = Math.max(0, minCol - keepMargin);
    const cropBottom = Math.max(0, grid.length - 1 - (maxRow + keepMargin));
    const cropRight = Math.max(0, (grid[0]?.length ?? 0) - 1 - (maxCol + keepMargin));

    if (cropTop === 0 && cropLeft === 0 && cropBottom === 0 && cropRight === 0) {
        return {
            grid,
            rows: grid.length,
            cols: grid[0]?.length ?? 0,
            playerStart,
            frame,
            removed: { top: 0, right: 0, bottom: 0, left: 0 },
        };
    }

    const nextGrid = grid
        .slice(cropTop, grid.length - cropBottom)
        .map((row) => row.slice(cropLeft, row.length - cropRight));

    const originalRows = grid.length;
    const originalCols = grid[0]?.length ?? 0;
    const cellWidth = originalCols > 0 ? frame.width / originalCols : 0;
    const cellHeight = originalRows > 0 ? frame.height / originalRows : 0;

    const nextPlayerStart = playerStart
        ? {
            x: playerStart.x - cropLeft,
            y: playerStart.y - cropTop,
        }
        : null;

    return {
        grid: nextGrid,
        rows: nextGrid.length,
        cols: nextGrid[0]?.length ?? 0,
        playerStart: nextPlayerStart,
        frame: {
            offsetX: frame.offsetX + cropLeft * cellWidth,
            offsetY: frame.offsetY + cropTop * cellHeight,
            width: frame.width - (cropLeft + cropRight) * cellWidth,
            height: frame.height - (cropTop + cropBottom) * cellHeight,
        },
        removed: {
            top: cropTop,
            right: cropRight,
            bottom: cropBottom,
            left: cropLeft,
        },
    };
};
