import { getAllLevels, isPlaceholderGrid } from '@/data/levels';
import { resolveLevelMapperBaseline } from './levelBaseline';

const TRAIN_LEVEL_MIN = 1;
const TRAIN_LEVEL_MAX = 35;
const SIGNATURE_SIZE = 10;
const MAX_LEVEL_SAMPLES_PER_TILE = 3;
const MAX_SIGNATURES_PER_TILE = 28;
const SAMPLE_INSET_RATIO = 0.14;

type TrainingGeometrySample = {
  levelId: number;
  rows: number;
  cols: number;
  cellWidth: number;
  cellHeight: number;
  aspectRatio: number;
};

export type TileSignature = {
  tileType: number;
  values: Float32Array;
  norm: number;
  borderRatio: number;
  sourceLevelId?: number;
};

export type MapperTrainingSet = {
  learnedLevels: number[];
  geometrySamples: TrainingGeometrySample[];
  signatures: TileSignature[];
  medianCellWidth?: number;
  medianCellHeight?: number;
  medianAspectRatio?: number;
  medianBorderRatio?: number;
  minCellWidth?: number;
  maxCellWidth?: number;
  minCellHeight?: number;
  maxCellHeight?: number;
  alignmentTolerancePx?: number;
  preferredRows?: number;
  preferredCols?: number;
  commonLayouts: Array<{ rows: number; cols: number; count: number }>;
};

export type MapperTrainingHints = {
  hintCellWidth?: number;
  hintCellHeight?: number;
  preferredRows?: number;
  preferredCols?: number;
  aspectRatio?: number;
};

let cachedKey = '';
let cachedPromise: Promise<MapperTrainingSet> | null = null;

const loadImage = async (imageURL: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load training image: ${imageURL}`));
    image.src = imageURL;
  });

const median = (values: number[]) => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const mode = (values: number[]) => {
  if (values.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let bestValue = values[0];
  let bestCount = -1;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }
  return bestValue;
};

const quantile = (values: number[], p: number) => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)));
  return sorted[index];
};

const computeBuildKey = () => {
  try {
    return getAllLevels()
      .filter((level) => level.id >= TRAIN_LEVEL_MIN && level.id <= TRAIN_LEVEL_MAX)
      .map((level) => {
        const saved = loadLevelMapperSavedState(level.id);
        return `${level.id}:${saved?.updatedAt ?? 0}:${saved?.rows ?? level.grid.length}:${saved?.cols ?? level.grid[0]?.length ?? 0}`;
      })
      .join('|');
  } catch {
    return `fallback:${Date.now()}`;
  }
};

const sampleGrayscalePatch = (
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size = SIGNATURE_SIZE
) => {
  const out = new Float32Array(size * size);
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  let borderSum = 0;
  let centerSum = 0;
  let borderCount = 0;
  let centerCount = 0;

  for (let yy = 0; yy < size; yy += 1) {
    const sampleY = Math.max(0, Math.min(imageHeight - 1, Math.floor(y0 + ((yy + 0.5) * height) / size)));
    const rowOffset = sampleY * imageWidth;
    for (let xx = 0; xx < size; xx += 1) {
      const sampleX = Math.max(0, Math.min(imageWidth - 1, Math.floor(x0 + ((xx + 0.5) * width) / size)));
      const pixelIndex = (rowOffset + sampleX) * 4;
      const r = pixels[pixelIndex];
      const g = pixels[pixelIndex + 1];
      const b = pixels[pixelIndex + 2];
      const gray = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const outIndex = yy * size + xx;
      out[outIndex] = gray;

      const isBorder = xx === 0 || yy === 0 || xx === size - 1 || yy === size - 1;
      if (isBorder) {
        borderSum += gray;
        borderCount += 1;
      } else {
        centerSum += gray;
        centerCount += 1;
      }
    }
  }

  let mean = 0;
  for (let i = 0; i < out.length; i += 1) mean += out[i];
  mean /= Math.max(1, out.length);

  let variance = 0;
  for (let i = 0; i < out.length; i += 1) {
    const centered = out[i] - mean;
    variance += centered * centered;
  }
  variance /= Math.max(1, out.length);
  const std = Math.sqrt(Math.max(variance, 1e-6));

  let norm = 0;
  for (let i = 0; i < out.length; i += 1) {
    out[i] = (out[i] - mean) / std;
    norm += out[i] * out[i];
  }
  norm = Math.sqrt(Math.max(norm, 1e-6));

  const borderMean = borderCount > 0 ? borderSum / borderCount : mean;
  const centerMean = centerCount > 0 ? centerSum / centerCount : mean;
  const borderRatio = Math.abs(borderMean - centerMean);

  return {
    values: out,
    norm,
    borderRatio,
  };
};

export const createTileSignatureFromImageData = (imageData: ImageData, size = SIGNATURE_SIZE): TileSignature => {
  const sampled = sampleGrayscalePatch(
    imageData.data,
    imageData.width,
    imageData.height,
    0,
    0,
    imageData.width,
    imageData.height,
    size
  );
  return {
    tileType: -1,
    values: sampled.values,
    norm: sampled.norm,
    borderRatio: sampled.borderRatio,
  };
};

export const createTileSignatureFromRegion = (
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size = SIGNATURE_SIZE
): TileSignature => {
  const sampled = sampleGrayscalePatch(pixels, imageWidth, imageHeight, x0, y0, x1, y1, size);
  return {
    tileType: -1,
    values: sampled.values,
    norm: sampled.norm,
    borderRatio: sampled.borderRatio,
  };
};

export const tileSignatureSimilarity = (a: TileSignature, b: TileSignature) => {
  let dot = 0;
  for (let i = 0; i < a.values.length; i += 1) dot += a.values[i] * b.values[i];
  const denom = Math.max(1e-6, a.norm * b.norm);
  return dot / denom;
};

const selectRepresentativeCells = (grid: number[][], positions: Array<{ row: number; col: number }>, limit: number) => {
  if (positions.length <= limit) return positions;
  const scoreCell = (row: number, col: number) => {
    let sameNeighbors = 0;
    const tileType = grid[row]?.[col];
    if (grid[row - 1]?.[col] === tileType) sameNeighbors += 1;
    if (grid[row + 1]?.[col] === tileType) sameNeighbors += 1;
    if (grid[row]?.[col - 1] === tileType) sameNeighbors += 1;
    if (grid[row]?.[col + 1] === tileType) sameNeighbors += 1;
    return sameNeighbors;
  };

  const ranked = [...positions].sort((a, b) => {
    const diff = scoreCell(b.row, b.col) - scoreCell(a.row, a.col);
    if (diff !== 0) return diff;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });

  const step = ranked.length / limit;
  const selected: Array<{ row: number; col: number }> = [];
  for (let index = 0; index < limit; index += 1) {
    selected.push(ranked[Math.min(ranked.length - 1, Math.floor(index * step))]);
  }
  return selected;
};

const pruneSignatureMap = (signatures: TileSignature[]) => {
  const byType = new Map<number, TileSignature[]>();
  for (const signature of signatures) {
    const list = byType.get(signature.tileType) ?? [];
    list.push(signature);
    byType.set(signature.tileType, list);
  }

  const pruned: TileSignature[] = [];
  for (const [tileType, list] of byType.entries()) {
    if (list.length <= MAX_SIGNATURES_PER_TILE) {
      pruned.push(...list);
      continue;
    }
    const step = list.length / MAX_SIGNATURES_PER_TILE;
    for (let index = 0; index < MAX_SIGNATURES_PER_TILE; index += 1) {
      const chosen = list[Math.min(list.length - 1, Math.floor(index * step))];
      pruned.push({ ...chosen, tileType });
    }
  }
  return pruned;
};

const buildTrainingSet = async (): Promise<MapperTrainingSet> => {
  if (typeof window === 'undefined') {
    return {
      learnedLevels: [],
      geometrySamples: [],
      signatures: [],
    };
  }

  const levels = getAllLevels().filter(
    (level) =>
      level.id >= TRAIN_LEVEL_MIN &&
      level.id <= TRAIN_LEVEL_MAX &&
      !isPlaceholderGrid(level.grid)
  );

  const geometrySamples: TrainingGeometrySample[] = [];
  const signatures: TileSignature[] = [];
  const learnedLevels: number[] = [];

  for (const level of levels) {
    const baseline = await resolveLevelMapperBaseline(level);
    if (!baseline.imageURL) continue;
    if (isPlaceholderGrid(baseline.grid)) continue;

    const image = await loadImage(baseline.imageURL);
    const frameWidth = baseline.gridFrameWidth ?? image.width;
    const frameHeight = baseline.gridFrameHeight ?? image.height;
    const frameOffsetX = Number.isFinite(baseline.gridOffsetX) ? baseline.gridOffsetX : 0;
    const frameOffsetY = Number.isFinite(baseline.gridOffsetY) ? baseline.gridOffsetY : 0;
    const cellWidth = frameWidth / Math.max(1, baseline.cols);
    const cellHeight = frameHeight / Math.max(1, baseline.rows);
    if (!Number.isFinite(cellWidth) || !Number.isFinite(cellHeight) || cellWidth <= 0 || cellHeight <= 0) continue;

    geometrySamples.push({
      levelId: level.id,
      rows: baseline.rows,
      cols: baseline.cols,
      cellWidth,
      cellHeight,
      aspectRatio: cellWidth / Math.max(1e-6, cellHeight),
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) continue;
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, image.width, image.height);
    const pixels = imageData.data;

    const positionsByType = new Map<number, Array<{ row: number; col: number }>>();
    for (let row = 0; row < baseline.grid.length; row += 1) {
      for (let col = 0; col < (baseline.grid[row]?.length ?? 0); col += 1) {
        const tileType = baseline.grid[row][col];
        if (tileType === 5) continue;
        const list = positionsByType.get(tileType) ?? [];
        list.push({ row, col });
        positionsByType.set(tileType, list);
      }
    }

    positionsByType.forEach((positions, tileType) => {
      const selected = selectRepresentativeCells(baseline.grid, positions, MAX_LEVEL_SAMPLES_PER_TILE);
      for (const { row, col } of selected) {
        const insetX = Math.min(cellWidth * SAMPLE_INSET_RATIO, Math.max(1, cellWidth / 5));
        const insetY = Math.min(cellHeight * SAMPLE_INSET_RATIO, Math.max(1, cellHeight / 5));
        const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(frameOffsetX + col * cellWidth + insetX)));
        const x1 = Math.max(x0 + 1, Math.min(image.width, Math.ceil(frameOffsetX + (col + 1) * cellWidth - insetX)));
        const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(frameOffsetY + row * cellHeight + insetY)));
        const y1 = Math.max(y0 + 1, Math.min(image.height, Math.ceil(frameOffsetY + (row + 1) * cellHeight - insetY)));
        const signature = createTileSignatureFromRegion(pixels, image.width, image.height, x0, y0, x1, y1);
        signatures.push({
          ...signature,
          tileType,
          sourceLevelId: level.id,
        });
      }
    });

    learnedLevels.push(level.id);
  }

  const prunedSignatures = pruneSignatureMap(signatures);
  const layoutCounts = new Map<string, { rows: number; cols: number; count: number }>();
  for (const sample of geometrySamples) {
    const key = `${sample.rows}x${sample.cols}`;
    const existing = layoutCounts.get(key) ?? { rows: sample.rows, cols: sample.cols, count: 0 };
    existing.count += 1;
    layoutCounts.set(key, existing);
  }
  const commonLayouts = Array.from(layoutCounts.values()).sort((a, b) => b.count - a.count);
  return {
    learnedLevels,
    geometrySamples,
    signatures: prunedSignatures,
    medianCellWidth: median(geometrySamples.map((sample) => sample.cellWidth)),
    medianCellHeight: median(geometrySamples.map((sample) => sample.cellHeight)),
    medianAspectRatio: median(geometrySamples.map((sample) => sample.aspectRatio)),
    medianBorderRatio: median(prunedSignatures.map((signature) => signature.borderRatio)),
    minCellWidth: quantile(geometrySamples.map((sample) => sample.cellWidth), 0.15),
    maxCellWidth: quantile(geometrySamples.map((sample) => sample.cellWidth), 0.85),
    minCellHeight: quantile(geometrySamples.map((sample) => sample.cellHeight), 0.15),
    maxCellHeight: quantile(geometrySamples.map((sample) => sample.cellHeight), 0.85),
    alignmentTolerancePx: Math.max(
      1,
      Math.round(
        Math.min(
          median(geometrySamples.map((sample) => sample.cellWidth)) ?? 8,
          median(geometrySamples.map((sample) => sample.cellHeight)) ?? 8
        ) * 0.12
      )
    ),
    preferredRows: mode(geometrySamples.map((sample) => sample.rows)),
    preferredCols: mode(geometrySamples.map((sample) => sample.cols)),
    commonLayouts,
  };
};

export const invalidateMapperTrainingSetCache = () => {
  cachedKey = '';
  cachedPromise = null;
};

export const getMapperTrainingSet = async () => {
  const key = computeBuildKey();
  if (cachedPromise && cachedKey === key) return cachedPromise;
  cachedKey = key;
  cachedPromise = buildTrainingSet();
  return cachedPromise;
};

export const getMapperTrainingHints = async (): Promise<MapperTrainingHints> => {
  const set = await getMapperTrainingSet();
  return {
    hintCellWidth: set.medianCellWidth,
    hintCellHeight: set.medianCellHeight,
    preferredRows: set.preferredRows,
    preferredCols: set.preferredCols,
    aspectRatio: set.medianAspectRatio,
  };
};

const buildSampleCells = (rows: number, cols: number, limit = 20) => {
  const sampleRows = Math.max(1, Math.min(rows, Math.round(Math.sqrt((limit * rows) / Math.max(1, cols)))));
  const sampleCols = Math.max(1, Math.min(cols, Math.ceil(limit / sampleRows)));
  const points: Array<{ row: number; col: number }> = [];
  const seen = new Set<string>();
  for (let rowIndex = 0; rowIndex < sampleRows; rowIndex += 1) {
    const row = Math.max(0, Math.min(rows - 1, Math.floor(((rowIndex + 0.5) * rows) / sampleRows)));
    for (let colIndex = 0; colIndex < sampleCols; colIndex += 1) {
      const col = Math.max(0, Math.min(cols - 1, Math.floor(((colIndex + 0.5) * cols) / sampleCols)));
      const key = `${row},${col}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({ row, col });
      if (points.length >= limit) return points;
    }
  }
  return points;
};

type GeometryCandidate = {
  rows: number;
  cols: number;
  offsetX: number;
  offsetY: number;
  cellWidth: number;
  cellHeight: number;
};

export const scoreGridGeometryAgainstTraining = (
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  candidate: GeometryCandidate,
  trainingSet: MapperTrainingSet
) => {
  if (trainingSet.signatures.length === 0) return Number.NEGATIVE_INFINITY;
  const sampleCells = buildSampleCells(candidate.rows, candidate.cols);
  if (sampleCells.length === 0) return Number.NEGATIVE_INFINITY;

  let similaritySum = 0;
  let borderPenalty = 0;
  let coverage = 0;

  const learnedAspect = trainingSet.medianAspectRatio ?? 1;
  const learnedBorderRatio = trainingSet.medianBorderRatio ?? 0;
  const learnedCellWidth = trainingSet.medianCellWidth ?? candidate.cellWidth;
  const learnedCellHeight = trainingSet.medianCellHeight ?? candidate.cellHeight;

  for (const { row, col } of sampleCells) {
    const insetX = Math.min(candidate.cellWidth * SAMPLE_INSET_RATIO, Math.max(1, candidate.cellWidth / 5));
    const insetY = Math.min(candidate.cellHeight * SAMPLE_INSET_RATIO, Math.max(1, candidate.cellHeight / 5));
    const x0 = Math.max(0, Math.min(imageWidth - 1, Math.floor(candidate.offsetX + col * candidate.cellWidth + insetX)));
    const x1 = Math.max(x0 + 1, Math.min(imageWidth, Math.ceil(candidate.offsetX + (col + 1) * candidate.cellWidth - insetX)));
    const y0 = Math.max(0, Math.min(imageHeight - 1, Math.floor(candidate.offsetY + row * candidate.cellHeight + insetY)));
    const y1 = Math.max(y0 + 1, Math.min(imageHeight, Math.ceil(candidate.offsetY + (row + 1) * candidate.cellHeight - insetY)));
    const signature = createTileSignatureFromRegion(pixels, imageWidth, imageHeight, x0, y0, x1, y1);

    let bestSimilarity = -1;
    for (const reference of trainingSet.signatures) {
      const similarity = tileSignatureSimilarity(signature, reference);
      if (similarity > bestSimilarity) bestSimilarity = similarity;
    }

    similaritySum += bestSimilarity;
    borderPenalty += Math.abs(signature.borderRatio - learnedBorderRatio);
    if (bestSimilarity > 0.36) coverage += 1;
  }

  const meanSimilarity = similaritySum / sampleCells.length;
  const meanBorderPenalty = borderPenalty / sampleCells.length;
  const aspectPenalty = Math.abs(candidate.cellWidth / Math.max(1e-6, candidate.cellHeight) - learnedAspect);
  const widthPenalty = Math.abs(candidate.cellWidth - learnedCellWidth) / Math.max(1, learnedCellWidth);
  const heightPenalty = Math.abs(candidate.cellHeight - learnedCellHeight) / Math.max(1, learnedCellHeight);
  const coverageBoost = coverage / sampleCells.length;

  return (
    meanSimilarity +
    coverageBoost * 0.12 -
    meanBorderPenalty * 0.45 -
    aspectPenalty * 0.32 -
    widthPenalty * 0.08 -
    heightPenalty * 0.08
  );
};

export const refineDetectedGridWithTraining = async (
  canvas: HTMLCanvasElement,
  detected: GeometryCandidate
) => {
  const trainingSet = await getMapperTrainingSet();
  if (trainingSet.signatures.length === 0) return null;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  let bestCandidate: GeometryCandidate = { ...detected };
  let bestScore = scoreGridGeometryAgainstTraining(pixels, canvas.width, canvas.height, bestCandidate, trainingSet);

  const coarseOffsetRangeX = Math.max(3, Math.min(10, Math.round(detected.cellWidth * 0.18)));
  const coarseOffsetRangeY = Math.max(3, Math.min(10, Math.round(detected.cellHeight * 0.18)));
  const coarseScaleCandidates = [0.97, 0.99, 1, 1.01, 1.03];

  for (const scaleX of coarseScaleCandidates) {
    for (const scaleY of coarseScaleCandidates) {
      const cellWidth = detected.cellWidth * scaleX;
      const cellHeight = detected.cellHeight * scaleY;
      for (let dx = -coarseOffsetRangeX; dx <= coarseOffsetRangeX; dx += 3) {
        for (let dy = -coarseOffsetRangeY; dy <= coarseOffsetRangeY; dy += 3) {
          const candidate: GeometryCandidate = {
            ...detected,
            offsetX: detected.offsetX + dx,
            offsetY: detected.offsetY + dy,
            cellWidth,
            cellHeight,
          };
          const score = scoreGridGeometryAgainstTraining(pixels, canvas.width, canvas.height, candidate, trainingSet);
          if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidate;
          }
        }
      }
    }
  }

  const fineScaleCandidates = [0.992, 1, 1.008];
  for (const scaleX of fineScaleCandidates) {
    for (const scaleY of fineScaleCandidates) {
      const cellWidth = bestCandidate.cellWidth * scaleX;
      const cellHeight = bestCandidate.cellHeight * scaleY;
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dy = -2; dy <= 2; dy += 1) {
          const candidate: GeometryCandidate = {
            ...bestCandidate,
            offsetX: bestCandidate.offsetX + dx,
            offsetY: bestCandidate.offsetY + dy,
            cellWidth,
            cellHeight,
          };
          const score = scoreGridGeometryAgainstTraining(pixels, canvas.width, canvas.height, candidate, trainingSet);
          if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidate;
          }
        }
      }
    }
  }

  return { candidate: bestCandidate, score: bestScore, trainingSet };
};
