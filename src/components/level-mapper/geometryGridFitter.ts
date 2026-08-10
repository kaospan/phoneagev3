import type { MapperTrainingHints, MapperTrainingSet } from './mapperTrainingSet';
import {
  createTileSignatureFromRegion,
  getMapperTrainingSet,
  refineDetectedGridWithTraining,
  scoreGridGeometryAgainstTraining,
  tileSignatureSimilarity,
} from './mapperTrainingSet';

export type GeometryFit = {
  rows: number;
  cols: number;
  offsetX: number;
  offsetY: number;
  cellWidth: number;
  cellHeight: number;
  runLenX: number;
  runLenY: number;
  scoreX: number;
  scoreY: number;
  confidence: number;
  durationMs: number;
  usedRunCounts: boolean;
};

type FitOptions = {
  useCurrentCounts: boolean;
  currentRows: number;
  currentCols: number;
  hints?: MapperTrainingHints & {
    hintCellWidth?: number;
    hintCellHeight?: number;
    preferredRows?: number;
    preferredCols?: number;
  };
};

type AxisFit = {
  count: number;
  cellSize: number;
  offset: number;
  score: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const smooth1d = (arr: Float32Array, windowSize: number) => {
  const w = Math.max(3, Math.floor(windowSize) | 1);
  const half = Math.floor(w / 2);
  const out = new Float32Array(arr.length);
  const prefix = new Float32Array(arr.length + 1);
  for (let i = 0; i < arr.length; i += 1) prefix[i + 1] = prefix[i] + arr[i];
  for (let i = 0; i < arr.length; i += 1) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(arr.length - 1, i + half);
    out[i] = (prefix[hi + 1] - prefix[lo]) / Math.max(1, hi - lo + 1);
  }
  return out;
};

const meanStd = (arr: Float32Array) => {
  if (arr.length === 0) return { mean: 0, std: 1 };
  let mean = 0;
  for (let i = 0; i < arr.length; i += 1) mean += arr[i];
  mean /= arr.length;
  let variance = 0;
  for (let i = 0; i < arr.length; i += 1) {
    const d = arr[i] - mean;
    variance += d * d;
  }
  variance /= Math.max(1, arr.length);
  return { mean, std: Math.sqrt(Math.max(variance, 1e-6)) };
};

const buildEdgeProfiles = (pixels: Uint8ClampedArray, width: number, height: number) => {
  const vertical = new Float32Array(width);
  const horizontal = new Float32Array(height);

  for (let y = 1; y < height; y += 1) {
    const row = y * width;
    const prevRow = (y - 1) * width;
    for (let x = 1; x < width; x += 1) {
      const idx = (row + x) * 4;
      const leftIdx = (row + x - 1) * 4;
      const upIdx = (prevRow + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const leftR = pixels[leftIdx];
      const leftG = pixels[leftIdx + 1];
      const leftB = pixels[leftIdx + 2];
      const upR = pixels[upIdx];
      const upG = pixels[upIdx + 1];
      const upB = pixels[upIdx + 2];
      const dx = Math.abs(r - leftR) + Math.abs(g - leftG) + Math.abs(b - leftB);
      const dy = Math.abs(r - upR) + Math.abs(g - upG) + Math.abs(b - upB);
      vertical[x] += dx;
      horizontal[y] += dy;
    }
  }

  return {
    vertical: smooth1d(vertical, Math.max(5, Math.round(width / 140))),
    horizontal: smooth1d(horizontal, Math.max(5, Math.round(height / 140))),
  };
};

const buildCountCandidates = (
  trainingSet: MapperTrainingSet,
  options: FitOptions,
  axis: 'rows' | 'cols',
  min: number,
  max: number,
) => {
  const values = new Set<number>();
  const current = axis === 'rows' ? options.currentRows : options.currentCols;
  const preferred = axis === 'rows' ? options.hints?.preferredRows ?? trainingSet.preferredRows : options.hints?.preferredCols ?? trainingSet.preferredCols;

  if (options.useCurrentCounts && current > 0) values.add(current);
  if (current > 0) values.add(current);
  if (preferred && preferred > 0) {
    values.add(preferred);
    values.add(preferred - 1);
    values.add(preferred + 1);
  }
  for (const layout of trainingSet.commonLayouts) {
    values.add(axis === 'rows' ? layout.rows : layout.cols);
  }

  return Array.from(values)
    .filter((value) => Number.isInteger(value) && value >= min && value <= max)
    .sort((a, b) => a - b);
};

const buildSeedSizes = (
  dimension: number,
  count: number,
  hintedSize: number | undefined,
  medianSize: number | undefined,
  minSize: number | undefined,
  maxSize: number | undefined,
) => {
  const factors = [0.94, 0.97, 1, 1.03, 1.06];
  const seeds = new Set<number>();
  const addSeed = (base: number | undefined) => {
    if (!Number.isFinite(base) || !base || base <= 2) return;
    for (const factor of factors) {
      const value = base * factor;
      const clamped = clamp(
        value,
        minSize ?? value * 0.92,
        maxSize ?? value * 1.08,
      );
      seeds.add(Number(clamped.toFixed(3)));
    }
  };

  addSeed(dimension / Math.max(1, count));
  addSeed(hintedSize);
  addSeed(medianSize);

  return Array.from(seeds)
    .filter((value) => value > 2)
    .sort((a, b) => a - b);
};

const sampleProfileAt = (profile: Float32Array, position: number) => {
  const center = clamp(Math.round(position), 0, profile.length - 1);
  let sum = 0;
  let count = 0;
  for (let delta = -1; delta <= 1; delta += 1) {
    const idx = center + delta;
    if (idx < 0 || idx >= profile.length) continue;
    sum += profile[idx];
    count += 1;
  }
  return count > 0 ? sum / count : 0;
};

const scoreAxisFit = (
  profile: Float32Array,
  dimension: number,
  count: number,
  cellSize: number,
  offset: number,
  expectedSize: number | undefined,
) => {
  const boundaryValues: number[] = [];
  const centerValues: number[] = [];

  for (let index = 0; index <= count; index += 1) {
    const pos = offset + index * cellSize;
    if (pos < -2 || pos > dimension + 2) continue;
    boundaryValues.push(sampleProfileAt(profile, pos));
  }

  for (let index = 0; index < count; index += 1) {
    const pos = offset + (index + 0.5) * cellSize;
    if (pos < 0 || pos >= dimension) continue;
    centerValues.push(sampleProfileAt(profile, pos));
  }

  if (boundaryValues.length === 0 || centerValues.length === 0) return Number.NEGATIVE_INFINITY;
  const boundaryMean = boundaryValues.reduce((sum, value) => sum + value, 0) / boundaryValues.length;
  const centerMean = centerValues.reduce((sum, value) => sum + value, 0) / centerValues.length;
  const { mean, std } = meanStd(profile);
  const frameSize = cellSize * count;
  const leftover = Math.abs(dimension - frameSize);
  const leftoverRatio = leftover / Math.max(dimension, 1);
  const sizePenalty = expectedSize ? Math.abs(cellSize - expectedSize) / Math.max(expectedSize, 1) : 0;
  return ((boundaryMean - centerMean) / std) + ((boundaryMean - mean) / std) * 0.35 - leftoverRatio * 0.75 - sizePenalty * 0.15;
};

const buildAxisFits = (
  profile: Float32Array,
  dimension: number,
  counts: number[],
  hintedSize: number | undefined,
  medianSize: number | undefined,
  minSize: number | undefined,
  maxSize: number | undefined,
) => {
  const fits: AxisFit[] = [];
  for (const count of counts) {
    const seedSizes = buildSeedSizes(dimension, count, hintedSize, medianSize, minSize, maxSize);
    for (const cellSize of seedSizes) {
      const frameSize = cellSize * count;
      const overhang = Math.max(cellSize * 0.35, 6);
      const minOffset = Math.floor(Math.min(0, dimension - frameSize) - overhang);
      const maxOffset = Math.ceil(Math.max(0, dimension - frameSize) + overhang);
      const step = Math.max(1, Math.round(cellSize / 14));
      for (let offset = minOffset; offset <= maxOffset; offset += step) {
        const score = scoreAxisFit(profile, dimension, count, cellSize, offset, medianSize);
        if (!Number.isFinite(score)) continue;
        fits.push({ count, cellSize, offset, score });
      }
    }
  }

  return fits
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
};

const buildValidationSamples = (rows: number, cols: number) => {
  const points: Array<{ row: number; col: number }> = [];
  const seen = new Set<string>();
  const rowsToSample = Math.min(rows, 4);
  const colsToSample = Math.min(cols, 6);
  for (let ry = 0; ry < rowsToSample; ry += 1) {
    const row = Math.max(0, Math.min(rows - 1, Math.floor(((ry + 0.5) * rows) / rowsToSample)));
    for (let cx = 0; cx < colsToSample; cx += 1) {
      const col = Math.max(0, Math.min(cols - 1, Math.floor(((cx + 0.5) * cols) / colsToSample)));
      const key = `${row},${col}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({ row, col });
    }
  }
  return points;
};

const validateGridCandidate = (
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  rows: number,
  cols: number,
  offsetX: number,
  offsetY: number,
  cellWidth: number,
  cellHeight: number,
  trainingSet: MapperTrainingSet,
) => {
  const samples = buildValidationSamples(rows, cols);
  const borderTarget = trainingSet.medianBorderRatio ?? 0.08;
  let invalid = 0;
  let borderPenalty = 0;
  let similarity = 0;

  for (const sample of samples) {
    const insetX = Math.min(cellWidth * 0.16, Math.max(1, cellWidth / 4));
    const insetY = Math.min(cellHeight * 0.16, Math.max(1, cellHeight / 4));
    const x0 = Math.floor(offsetX + sample.col * cellWidth + insetX);
    const x1 = Math.ceil(offsetX + (sample.col + 1) * cellWidth - insetX);
    const y0 = Math.floor(offsetY + sample.row * cellHeight + insetY);
    const y1 = Math.ceil(offsetY + (sample.row + 1) * cellHeight - insetY);
    if (x1 - x0 < 2 || y1 - y0 < 2) {
      invalid += 1;
      continue;
    }

    const signature = createTileSignatureFromRegion(
      pixels,
      imageWidth,
      imageHeight,
      clamp(x0, 0, imageWidth - 1),
      clamp(y0, 0, imageHeight - 1),
      clamp(x1, 1, imageWidth),
      clamp(y1, 1, imageHeight),
    );

    let best = -1;
    for (const reference of trainingSet.signatures) {
      const similarityScore = tileSignatureSimilarity(signature, reference);
      if (similarityScore > best) best = similarityScore;
    }

    similarity += best;
    const borderDelta = Math.abs(signature.borderRatio - borderTarget);
    borderPenalty += borderDelta;
    if (best < 0.3 || signature.borderRatio > borderTarget * 2.6 + 0.06) invalid += 1;
  }

  const sampleCount = Math.max(1, samples.length);
  return {
    averageSimilarity: similarity / sampleCount,
    borderPenalty: borderPenalty / sampleCount,
    invalidRatio: invalid / sampleCount,
  };
};

const geometryConfidence = (score: number, invalidRatio: number, similarity: number) => {
  const base = clamp((score + 0.6) / 2.4, 0, 1);
  const quality = clamp(similarity * 0.7 + (1 - invalidRatio) * 0.3, 0, 1);
  return clamp(base * 0.55 + quality * 0.45, 0, 1);
};

export const detectDeterministicGridWithTraining = async (
  canvas: HTMLCanvasElement,
  options: FitOptions,
): Promise<GeometryFit | null> => {
  const t0 = performance.now();
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  const trainingSet = await getMapperTrainingSet();
  if (trainingSet.signatures.length === 0) return null;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const { vertical, horizontal } = buildEdgeProfiles(pixels, canvas.width, canvas.height);

  const rowCandidates = buildCountCandidates(trainingSet, options, 'rows', 6, 16);
  const colCandidates = buildCountCandidates(trainingSet, options, 'cols', 8, 26);
  if (rowCandidates.length === 0 || colCandidates.length === 0) return null;

  const xFits = buildAxisFits(
    vertical,
    canvas.width,
    colCandidates,
    options.useCurrentCounts ? canvas.width / Math.max(1, options.currentCols) : options.hints?.hintCellWidth,
    trainingSet.medianCellWidth,
    trainingSet.minCellWidth,
    trainingSet.maxCellWidth,
  );
  const yFits = buildAxisFits(
    horizontal,
    canvas.height,
    rowCandidates,
    options.useCurrentCounts ? canvas.height / Math.max(1, options.currentRows) : options.hints?.hintCellHeight,
    trainingSet.medianCellHeight,
    trainingSet.minCellHeight,
    trainingSet.maxCellHeight,
  );
  if (xFits.length === 0 || yFits.length === 0) return null;

  let best: GeometryFit | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const xFit of xFits) {
    for (const yFit of yFits) {
      if (options.useCurrentCounts && (xFit.count !== options.currentCols || yFit.count !== options.currentRows)) {
        continue;
      }
      const candidate = {
        rows: yFit.count,
        cols: xFit.count,
        offsetX: xFit.offset,
        offsetY: yFit.offset,
        cellWidth: xFit.cellSize,
        cellHeight: yFit.cellSize,
      };

      const learnedScore = scoreGridGeometryAgainstTraining(
        pixels,
        canvas.width,
        canvas.height,
        candidate,
        trainingSet,
      );
      const validation = validateGridCandidate(
        pixels,
        canvas.width,
        canvas.height,
        candidate.rows,
        candidate.cols,
        candidate.offsetX,
        candidate.offsetY,
        candidate.cellWidth,
        candidate.cellHeight,
        trainingSet,
      );
      const totalScore =
        learnedScore +
        xFit.score * 0.16 +
        yFit.score * 0.16 -
        validation.borderPenalty * 0.7 -
        validation.invalidRatio * 1.2;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        best = {
          ...candidate,
          runLenX: candidate.cols,
          runLenY: candidate.rows,
          scoreX: xFit.score,
          scoreY: yFit.score,
          confidence: geometryConfidence(totalScore, validation.invalidRatio, validation.averageSimilarity),
          durationMs: performance.now() - t0,
          usedRunCounts: options.useCurrentCounts,
        };
      }
    }
  }

  if (!best) return null;

  const refined = await refineDetectedGridWithTraining(canvas, {
    rows: best.rows,
    cols: best.cols,
    offsetX: best.offsetX,
    offsetY: best.offsetY,
    cellWidth: best.cellWidth,
    cellHeight: best.cellHeight,
  });

  if (refined?.candidate) {
    best = {
      ...best,
      offsetX: refined.candidate.offsetX,
      offsetY: refined.candidate.offsetY,
      cellWidth: refined.candidate.cellWidth,
      cellHeight: refined.candidate.cellHeight,
      confidence: clamp(best.confidence + 0.06, 0, 1),
      durationMs: performance.now() - t0,
    };
  }

  return best;
};
