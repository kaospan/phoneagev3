import { buildReferenceMatcher } from '@/lib/spriteMatching';

export interface BuildLevelOptions {
  rows?: number;
  cols?: number;
  minSimilarity?: number;
  timeoutMs?: number;
  onProgress?: (status: string) => void;
  yieldEveryRows?: number;
}

export interface BuiltLevel {
  grid: number[][];
  playerStart: { x: number; y: number };
  cavePos: { x: number; y: number };
  rows: number;
  cols: number;
  source: string;
  stats: {
    totalCells: number;
    spriteMatches: number;
    heuristicMatches: number;
    nonVoidCount: number;
    voidRatio: number;
    spriteMatchRatio: number;
    confidenceScore: number;
    caveAutoPlaced: boolean;
    playerAdjusted: boolean;
    sourceWidth: number;
    sourceHeight: number;
  };
}

const getSourceLabel = (source: string) => {
  const normalized = source.split('?')[0].split('#')[0];
  const lastSegment = normalized.split('/').pop() || normalized;
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
};

const loadImage = (url: string, timeoutMs = 8000): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const img = new Image();

    timeoutId = setTimeout(() => {
      timeoutId = null;
      reject(new Error(`Image load timeout (${timeoutMs}ms): ${url}`));
    }, timeoutMs);

    const clearTimer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    img.onload = () => {
      clearTimer();
      resolve(img);
    };
    img.onerror = (err) => {
      clearTimer();
      reject(err);
    };
    img.src = url;
  });
};

const guessGrid = (width: number, height: number) => {
  if (width >= height) {
    return { rows: 11, cols: 20 };
  }
  return { rows: 20, cols: 11 };
};

const averageColor = (data: Uint8ClampedArray) => {
  let r = 0;
  let g = 0;
  let b = 0;
  const total = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return {
    r: r / total,
    g: g / total,
    b: b / total,
  };
};

const heuristicClassify = (imageData: ImageData): number => {
  const { r, g, b } = averageColor(imageData.data);
  const brightness = (r + g + b) / 3;

  if (brightness < 35) return 5; // void
  if (b > r * 1.25 && b > g * 1.15) return 4; // water
  if (r > g * 1.25 && r > b * 1.2 && brightness > 90) return 1; // wall/fire
  if (brightness > 170) return 0; // floor
  if (brightness > 120) return 0; // lighter floor
  return 2; // stone fallback
};

const findFloorNearBottom = (grid: number[][]) => {
  for (let y = grid.length - 1; y >= 0; y -= 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      if (grid[y][x] === 0 || grid[y][x] === 7 || grid[y][x] === 8 || grid[y][x] === 9 || grid[y][x] === 10) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: 0 };
};

const findFloorNearTop = (grid: number[][]) => {
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      if (grid[y][x] === 0) return { x, y };
    }
  }
  return { x: 0, y: 0 };
};

const findTile = (grid: number[][], tile: number) => {
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      if (grid[y][x] === tile) return { x, y };
    }
  }
  return null;
};

export const buildLevelFromImage = async (
  imageUrl: string,
  options: BuildLevelOptions = {}
): Promise<BuiltLevel> => {
  const sourceLabel = getSourceLabel(imageUrl);
  options.onProgress?.(`Loading ${sourceLabel}...`);
  const image = await loadImage(imageUrl, options.timeoutMs ?? 8000);
  const { rows, cols } = options.rows && options.cols
    ? { rows: options.rows, cols: options.cols }
    : guessGrid(image.width, image.height);

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(image, 0, 0);

  options.onProgress?.(`Preparing references for ${sourceLabel}...`);
  const matcher = await buildReferenceMatcher(options.minSimilarity ?? 0.72);

  const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(5));
  const cellWidth = image.width / cols;
  const cellHeight = image.height / rows;
  let spriteMatches = 0;
  let heuristicMatches = 0;

  const yieldEvery = options.yieldEveryRows ?? 2;

  for (let r = 0; r < rows; r += 1) {
    if (r % 2 === 0) {
      options.onProgress?.(`Scanning ${sourceLabel}: row ${r + 1}/${rows}`);
    }
    for (let c = 0; c < cols; c += 1) {
      const x0 = Math.floor(c * cellWidth + cellWidth * 0.1);
      const y0 = Math.floor(r * cellHeight + cellHeight * 0.1);
      const x1 = Math.floor((c + 1) * cellWidth - cellWidth * 0.1);
      const y1 = Math.floor((r + 1) * cellHeight - cellHeight * 0.1);
      const width = Math.max(1, x1 - x0);
      const height = Math.max(1, y1 - y0);

      const cellImageData = ctx.getImageData(x0, y0, width, height);
      let cellType: number | null = null;

      if (matcher) {
        cellType = await matcher(cellImageData);
        if (cellType !== null) {
          spriteMatches += 1;
        }
      }

      if (cellType === null) {
        cellType = heuristicClassify(cellImageData);
        heuristicMatches += 1;
      }

      grid[r][c] = cellType;
    }

    if (yieldEvery > 0 && r % yieldEvery === 0) {
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
    }
  }

  let cavePos = findTile(grid, 3);
  let caveAutoPlaced = false;
  if (!cavePos) {
    cavePos = findFloorNearTop(grid);
    grid[cavePos.y][cavePos.x] = 3;
    caveAutoPlaced = true;
  }

  let playerStart = findFloorNearBottom(grid);
  let playerAdjusted = false;
  if (playerStart.x === cavePos.x && playerStart.y === cavePos.y) {
    playerStart = findFloorNearBottom(grid.map((row, y) =>
      row.map((cell, x) => (x === cavePos.x && y === cavePos.y ? 2 : cell))
    ));
    playerAdjusted = true;
  }

  const totalCells = rows * cols;
  const nonVoidCount = grid.flat().filter((cell) => cell !== 5).length;
  const voidRatio = totalCells > 0 ? 1 - nonVoidCount / totalCells : 1;
  const spriteMatchRatio = totalCells > 0 ? spriteMatches / totalCells : 0;
  const confidenceScore = Math.max(0, Math.min(1, spriteMatchRatio * 0.7 + (nonVoidCount / totalCells) * 0.3));

  return {
    grid,
    playerStart,
    cavePos,
    rows,
    cols,
    source: imageUrl,
    stats: {
      totalCells,
      spriteMatches,
      heuristicMatches,
      nonVoidCount,
      voidRatio,
      spriteMatchRatio,
      confidenceScore,
      caveAutoPlaced,
      playerAdjusted,
      sourceWidth: image.width,
      sourceHeight: image.height
    }
  };
};

export const buildLevelFromSources = async (
  sources: string[],
  options: BuildLevelOptions = {}
): Promise<BuiltLevel> => {
  const usableSources = sources.filter(Boolean);
  if (usableSources.length === 0) {
    throw new Error('No usable sources supplied for level build');
  }

  let best: BuiltLevel | null = null;

  for (const source of usableSources) {
    try {
      options.onProgress?.(`Building from ${getSourceLabel(source)}...`);
      const built = await buildLevelFromImage(source, options);
      const nonVoid = built.grid.flat().filter((cell) => cell !== 5).length;

      if (!best || nonVoid > best.grid.flat().filter((cell) => cell !== 5).length) {
        best = built;
      }
    } catch (error) {
      console.warn('Failed to build from source', source, error);
    }
  }

  if (!best) {
    throw new Error('Failed to build level from all sources');
  }

  return best;
};
