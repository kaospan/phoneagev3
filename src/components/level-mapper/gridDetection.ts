const MIN_DETECTED_ROWS = 6;
const MAX_DETECTED_ROWS = 16;
const MIN_DETECTED_COLS = 8;
const MAX_DETECTED_COLS = 26;
const MAX_DETECTED_CELLS = 320;

type DetectGridHints = {
    hintCellWidth?: number;
    hintCellHeight?: number;
    preferredCols?: number;
    preferredRows?: number;
};

export type DetectedGrid = {
    rows: number;
    cols: number;
    offsetX: number;
    offsetY: number;
    cellWidth: number;
    cellHeight: number;
    // Debug/UX metrics (best-effort heuristics)
    runLenX: number;
    runLenY: number;
    scoreX: number;
    scoreY: number;
    confidence: number; // 0..1
    durationMs: number;
    usedRunCounts: boolean;
};

// Grid line detection logic
export const detectGridLines = (
    canvas: HTMLCanvasElement,
    useDetectCurrentCounts: boolean,
    currentRows: number,
    currentCols: number,
    hints?: DetectGridHints
): DetectedGrid | null => {
    console.log('🔍 detectGridLines() started');
    const t0 = performance.now();

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
        console.error('❌ No context in detectGrid');
        return null;
    }
    
    const { width, height } = canvas;
    console.log(`📐 Canvas size: ${width}x${height}`);

    const imgData = ctx.getImageData(0, 0, width, height).data;
    console.log(`✓ ImageData retrieved: ${imgData.length} bytes`);

    // Primary fast path: detect period + offset from gradient periodicity, then derive board bounds by sampling cell centers.
    // This is intentionally designed to work even when screenshots are clipped or have noisy backgrounds.
    const primaryDetect = (() => {
        try {
            const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
            const minDim = Math.min(width, height);
            const minSize = Math.max(10, Math.floor(minDim / 90));
            const maxSize = Math.min(180, Math.floor(minDim / 2));

            // Greyscale (0..255)
            const gray = new Float32Array(width * height);
            for (let i = 0, p = 0; p < gray.length; p += 1, i += 4) {
                const r = imgData[i];
                const g = imgData[i + 1];
                const b = imgData[i + 2];
                gray[p] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            }

            // Simple gradient magnitude (cheap, robust enough): |dx| + |dy|
            const grad = new Float32Array(width * height);
            for (let y = 1; y < height - 1; y += 1) {
                const row = y * width;
                const rowUp = (y - 1) * width;
                const rowDn = (y + 1) * width;
                for (let x = 1; x < width - 1; x += 1) {
                    const idx = row + x;
                    const dx = gray[idx + 1] - gray[idx - 1];
                    const dy = gray[rowDn + x] - gray[rowUp + x];
                    grad[idx] = Math.abs(dx) + Math.abs(dy);
                }
            }

            const step = Math.max(1, Math.round(minDim / 900));
            const vProfile = new Float32Array(width);
            const hProfile = new Float32Array(height);

            for (let y = 1; y < height - 1; y += step) {
                const row = y * width;
                for (let x = 1; x < width - 1; x += step) {
                    vProfile[x] += grad[row + x];
                }
            }
            for (let x = 1; x < width - 1; x += step) {
                for (let y = 1; y < height - 1; y += step) {
                    hProfile[y] += grad[y * width + x];
                }
            }

            const smooth1d = (arr: Float32Array, windowSize: number) => {
                const w = Math.max(3, Math.floor(windowSize) | 1);
                const half = Math.floor(w / 2);
                const out = new Float32Array(arr.length);
                const prefix = new Float32Array(arr.length + 1);
                for (let i = 0; i < arr.length; i += 1) prefix[i + 1] = prefix[i] + arr[i];
                for (let i = 0; i < arr.length; i += 1) {
                    const lo = Math.max(0, i - half);
                    const hi = Math.min(arr.length - 1, i + half);
                    const sum = prefix[hi + 1] - prefix[lo];
                    out[i] = sum / Math.max(1, (hi - lo + 1));
                }
                return out;
            };

            const vSmooth = smooth1d(vProfile, Math.max(9, Math.round(width / 120) | 1));
            const hSmooth = smooth1d(hProfile, Math.max(9, Math.round(height / 120) | 1));

            const bestPeriodByAutocorr = (arr: Float32Array, hint?: number) => {
                const lo = hint ? Math.max(minSize, Math.round(hint * 0.75)) : minSize;
                const hi = hint ? Math.min(maxSize, Math.round(hint * 1.25)) : maxSize;
                let bestLag = 0;
                let bestScore = -Infinity;
                let bestEnergy = 0;

                // Ignore DC by de-meaning a little (helps on smooth gradients)
                let mean = 0;
                for (let i = 0; i < arr.length; i += 1) mean += arr[i];
                mean /= Math.max(1, arr.length);

                for (let lag = lo; lag <= hi; lag += 1) {
                    let num = 0;
                    let denA = 0;
                    let denB = 0;
                    const n = arr.length - lag;
                    if (n < 32) continue;
                    for (let i = 0; i < n; i += 1) {
                        const a = arr[i] - mean;
                        const b = arr[i + lag] - mean;
                        num += a * b;
                        denA += a * a;
                        denB += b * b;
                    }
                    const denom = Math.sqrt(denA * denB);
                    const score = denom > 1e-6 ? num / denom : -1;
                    // prefer reasonably strong signals
                    if (score > bestScore) {
                        bestScore = score;
                        bestLag = lag;
                        bestEnergy = denA / Math.max(1, n);
                    }
                }
                return { lag: bestLag, score: bestScore, energy: bestEnergy };
            };

            const hintW = useDetectCurrentCounts
                ? (currentCols > 0 ? width / currentCols : undefined)
                : hints?.hintCellWidth;
            const hintH = useDetectCurrentCounts
                ? (currentRows > 0 ? height / currentRows : undefined)
                : hints?.hintCellHeight;

            const px = bestPeriodByAutocorr(vSmooth, hintW);
            const py = bestPeriodByAutocorr(hSmooth, hintH);
            if (px.lag <= 0 || py.lag <= 0) return null;

            const bestOffset = (arr: Float32Array, period: number) => {
                let best = 0;
                let bestSum = -Infinity;
                for (let o = 0; o < period; o += 1) {
                    let s = 0;
                    for (let p = o; p < arr.length; p += period) s += arr[p];
                    if (s > bestSum) {
                        bestSum = s;
                        best = o;
                    }
                }
                return { offset: best, score: bestSum };
            };

            const ox = bestOffset(vSmooth, px.lag);
            const oy = bestOffset(hSmooth, py.lag);

            // Estimate board bounds by sampling cell-center texture/edge energy.
            const maxCols = Math.max(1, Math.floor((width - ox.offset) / px.lag));
            const maxRows = Math.max(1, Math.floor((height - oy.offset) / py.lag));
            if (maxCols * maxRows > 1600) {
                // Too many cells for a detailed pass at this resolution; skip primary bounds detection.
                return null;
            }

            const cellEnergy = new Float32Array(maxCols * maxRows);
            let idx = 0;
            for (let r = 0; r < maxRows; r += 1) {
                const cy = Math.round(oy.offset + (r + 0.5) * py.lag);
                for (let c = 0; c < maxCols; c += 1) {
                    const cx = Math.round(ox.offset + (c + 0.5) * px.lag);
                    // Sample a small 3x3 around center.
                    let e = 0;
                    let n = 0;
                    for (let dy = -1; dy <= 1; dy += 1) {
                        const y = Math.max(1, Math.min(height - 2, cy + dy));
                        const row = y * width;
                        for (let dx = -1; dx <= 1; dx += 1) {
                            const x = Math.max(1, Math.min(width - 2, cx + dx));
                            e += grad[row + x];
                            n += 1;
                        }
                    }
                    cellEnergy[idx++] = n ? e / n : 0;
                }
            }

            // Robust threshold using percentiles (background tends to be smooth, board cells have stronger edges/texture).
            const sample = Array.from(cellEnergy);
            sample.sort((a, b) => a - b);
            const q = (p: number) => sample[Math.max(0, Math.min(sample.length - 1, Math.floor((sample.length - 1) * p)))];
            const p20 = q(0.2);
            const p80 = q(0.8);
            const thr = p20 + (p80 - p20) * 0.18;

            let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
            let occupied = 0;
            idx = 0;
            for (let r = 0; r < maxRows; r += 1) {
                for (let c = 0; c < maxCols; c += 1) {
                    if (cellEnergy[idx++] > thr) {
                        occupied += 1;
                        if (r < minR) minR = r;
                        if (c < minC) minC = c;
                        if (r > maxR) maxR = r;
                        if (c > maxC) maxC = c;
                    }
                }
            }

            if (!Number.isFinite(minR) || !Number.isFinite(minC) || maxR < minR || maxC < minC) return null;

            // Expand bounds conservatively. Some levels have an outer ring that is lower-contrast (e.g. mostly void),
            // so a hard threshold can miss the last row/col. We grow the box if the next edge still has "board-like"
            // center texture energy.
            const pad = 1;
            minR = Math.max(0, minR - pad);
            minC = Math.max(0, minC - pad);
            maxR = Math.min(maxRows - 1, maxR + pad);
            maxC = Math.min(maxCols - 1, maxC + pad);

            const expandThr = p20 + (p80 - p20) * 0.08; // lower than main thr; only used to include faint edge rings
            const energyAt = (r: number, c: number) => cellEnergy[r * maxCols + c];
            const rowStats = (r: number, c0: number, c1: number) => {
                let sum = 0;
                let n = 0;
                let max = 0;
                let aboveMain = 0;
                let aboveEdge = 0;
                for (let c = c0; c <= c1; c += 1) {
                    const e = energyAt(r, c);
                    sum += e;
                    n += 1;
                    if (e > max) max = e;
                    if (e > thr) aboveMain += 1;
                    if (e > expandThr) aboveEdge += 1;
                }
                const mean = n ? sum / n : 0;
                return { mean, max, n, aboveMain, aboveEdge };
            };
            const colStats = (c: number, r0: number, r1: number) => {
                let sum = 0;
                let n = 0;
                let max = 0;
                let aboveMain = 0;
                let aboveEdge = 0;
                for (let r = r0; r <= r1; r += 1) {
                    const e = energyAt(r, c);
                    sum += e;
                    n += 1;
                    if (e > max) max = e;
                    if (e > thr) aboveMain += 1;
                    if (e > expandThr) aboveEdge += 1;
                }
                const mean = n ? sum / n : 0;
                return { mean, max, n, aboveMain, aboveEdge };
            };

            // Edge rows/cols can be sparse (thin borders, clipped screenshots). Mean-energy alone is too strict.
            const shouldExpand = (s: { mean: number; max: number; n: number; aboveMain: number; aboveEdge: number }) => {
                if (!s.n) return false;
                if (s.mean > expandThr) return true;
                const edgeRatio = s.aboveEdge / s.n;
                const mainRatio = s.aboveMain / s.n;
                // Include sparse borders if there are some strong cells on that edge.
                if (edgeRatio >= 0.08 && s.max > expandThr) return true;
                if (mainRatio >= 0.04 && s.max > thr) return true;
                return false;
            };

            // Grow up to 3 cells on each side when it helps; stop early if it would exceed constraints.
            // This is important for cases where the outermost ring is low-contrast or only partially present.
            for (let i = 0; i < 3; i += 1) {
                // top
                if (minR > 0 && (maxR - (minR - 1) + 1) <= MAX_DETECTED_ROWS) {
                    const candRows = maxR - (minR - 1) + 1;
                    const candCols = maxC - minC + 1;
                    const candCells = candRows * candCols;
                    const s = rowStats(minR - 1, minC, maxC);
                    if (candCells <= MAX_DETECTED_CELLS && shouldExpand(s)) minR -= 1;
                }
                // bottom
                if (maxR < maxRows - 1 && ((maxR + 1) - minR + 1) <= MAX_DETECTED_ROWS) {
                    const candRows = (maxR + 1) - minR + 1;
                    const candCols = maxC - minC + 1;
                    const candCells = candRows * candCols;
                    const s = rowStats(maxR + 1, minC, maxC);
                    if (candCells <= MAX_DETECTED_CELLS && shouldExpand(s)) maxR += 1;
                }
                // left
                if (minC > 0 && (maxC - (minC - 1) + 1) <= MAX_DETECTED_COLS) {
                    const candRows = maxR - minR + 1;
                    const candCols = maxC - (minC - 1) + 1;
                    const candCells = candRows * candCols;
                    const s = colStats(minC - 1, minR, maxR);
                    if (candCells <= MAX_DETECTED_CELLS && shouldExpand(s)) minC -= 1;
                }
                // right
                if (maxC < maxCols - 1 && ((maxC + 1) - minC + 1) <= MAX_DETECTED_COLS) {
                    const candRows = maxR - minR + 1;
                    const candCols = (maxC + 1) - minC + 1;
                    const candCells = candRows * candCols;
                    const s = colStats(maxC + 1, minR, maxR);
                    if (candCells <= MAX_DETECTED_CELLS && shouldExpand(s)) maxC += 1;
                }
            }

            // After expansion, trim any "background-only" edge rows/cols that were included due to noise.
            // This helps with screenshots that have a thin extra column of rocky background on one side,
            // which can otherwise inflate cols by +1 (e.g. 21 instead of 20).
            const shouldTrim = (s: { mean: number; max: number; n: number; aboveMain: number; aboveEdge: number }) => {
                if (!s.n) return false;
                // If there are any clearly "board" cells, do not trim.
                if (s.aboveMain > 0) return false;
                // A tiny amount of edge activity is still likely background noise.
                const edgeRatio = s.aboveEdge / s.n;
                if (edgeRatio >= 0.04) return false;
                return true;
            };

            for (let i = 0; i < 2; i += 1) {
                const rowsNow = maxR - minR + 1;
                const colsNow = maxC - minC + 1;
                if (rowsNow <= MIN_DETECTED_ROWS || colsNow <= MIN_DETECTED_COLS) break;

                // left
                if (colsNow > MIN_DETECTED_COLS) {
                    const s = colStats(minC, minR, maxR);
                    if (shouldTrim(s)) minC += 1;
                }
                // right
                {
                    const colsNow2 = maxC - minC + 1;
                    if (colsNow2 > MIN_DETECTED_COLS) {
                        const s = colStats(maxC, minR, maxR);
                        if (shouldTrim(s)) maxC -= 1;
                    }
                }
                // top
                {
                    const rowsNow2 = maxR - minR + 1;
                    if (rowsNow2 > MIN_DETECTED_ROWS) {
                        const s = rowStats(minR, minC, maxC);
                        if (shouldTrim(s)) minR += 1;
                    }
                }
                // bottom
                {
                    const rowsNow3 = maxR - minR + 1;
                    if (rowsNow3 > MIN_DETECTED_ROWS) {
                        const s = rowStats(maxR, minC, maxC);
                        if (shouldTrim(s)) maxR -= 1;
                    }
                }
            }

            const rowsFromBox = maxR - minR + 1;
            const colsFromBox = maxC - minC + 1;
            if (rowsFromBox < MIN_DETECTED_ROWS || rowsFromBox > MAX_DETECTED_ROWS) return null;
            if (colsFromBox < MIN_DETECTED_COLS || colsFromBox > MAX_DETECTED_COLS) return null;
            if (rowsFromBox * colsFromBox > MAX_DETECTED_CELLS) return null;

            const finalRows = useDetectCurrentCounts ? currentRows : rowsFromBox;
            const finalCols = useDetectCurrentCounts ? currentCols : colsFromBox;

            if (useDetectCurrentCounts) {
                if (currentRows < MIN_DETECTED_ROWS || currentRows > MAX_DETECTED_ROWS) return null;
                if (currentCols < MIN_DETECTED_COLS || currentCols > MAX_DETECTED_COLS) return null;
                if (currentRows * currentCols > MAX_DETECTED_CELLS) return null;
            }

            // When keeping the user's rows/cols ("snap" mode), we still want the detected board origin (minR/minC).
            // Previously we snapped to the strongest global phase only, which misaligned many boards.
            let originR = minR;
            let originC = minC;
            if (useDetectCurrentCounts) {
                const extraR = currentRows - rowsFromBox;
                const extraC = currentCols - colsFromBox;
                // Center the detected box inside the requested shape when possible.
                originR = minR - Math.floor(extraR / 2);
                originC = minC - Math.floor(extraC / 2);
                const maxOriginR = Math.max(0, maxRows - currentRows);
                const maxOriginC = Math.max(0, maxCols - currentCols);
                originR = Math.max(0, Math.min(maxOriginR, originR));
                originC = Math.max(0, Math.min(maxOriginC, originC));
            }

            const offsetX = ox.offset + originC * px.lag;
            const offsetY = oy.offset + originR * py.lag;

            // Offset refinement: nudge within +/- ~10px to maximize boundary strength at expected lines.
            const scoreBoundaries = (arr: Float32Array, offset: number, size: number, count: number) => {
                let sum = 0;
                for (let i = 0; i <= count; i += 1) {
                    const pos = Math.round(offset + i * size);
                    if (pos >= 0 && pos < arr.length) sum += arr[pos];
                }
                return sum;
            };
            const refineOffset = (arr: Float32Array, offset: number, size: number, count: number) => {
                const range = Math.min(10, Math.max(3, Math.round(size * 0.12)));
                let best = offset;
                let bestScore = scoreBoundaries(arr, offset, size, count);
                for (let d = -range; d <= range; d += 1) {
                    const cand = offset + d;
                    const s = scoreBoundaries(arr, cand, size, count);
                    if (s > bestScore) { bestScore = s; best = cand; }
                }
                return best;
            };

            const refinedX = Math.max(0, Math.min(width - 1, refineOffset(vSmooth, offsetX, px.lag, finalCols)));
            const refinedY = Math.max(0, Math.min(height - 1, refineOffset(hSmooth, offsetY, py.lag, finalRows)));

            const expectedOcc = (useDetectCurrentCounts ? (currentRows * currentCols) : (rowsFromBox * colsFromBox));
            const occRatio = expectedOcc > 0 ? occupied / expectedOcc : 0;
            const conf =
                clamp01((px.score + 1) * 0.5) *
                clamp01((py.score + 1) * 0.5) *
                clamp01(occRatio);

            const durationMs = performance.now() - t0;
            const out: DetectedGrid = {
                rows: finalRows,
                cols: finalCols,
                offsetX: refinedX,
                offsetY: refinedY,
                cellWidth: px.lag,
                cellHeight: py.lag,
                runLenX: finalCols + 1,
                runLenY: finalRows + 1,
                scoreX: px.score,
                scoreY: py.score,
                confidence: conf,
                durationMs,
                usedRunCounts: true,
            };
            return out;
        } catch (e) {
            console.warn('primaryDetect failed', e);
            return null;
        }
    })();

    if (primaryDetect) {
        console.log(`✓ Primary grid detected: ${primaryDetect.rows}x${primaryDetect.cols} (conf ${primaryDetect.confidence.toFixed(2)})`);
        return primaryDetect;
    }

    // Larger images can be scanned with a bigger step without losing the periodicity signal.
    const step = Math.max(2, Math.round(Math.min(width, height) / 700));
    const verticalEdge: number[] = Array(width).fill(0);
    const horizontalEdge: number[] = Array(height).fill(0);

    const luma = (idx: number) => {
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    console.log('🔍 Scanning edge strengths...');
    for (let y = 0; y < height; y += step) {
        for (let x = 1; x < width; x += step) {
            const i = (y * width + x) * 4;
            const j = (y * width + (x - 1)) * 4;
            verticalEdge[x] += Math.abs(luma(i) - luma(j));
        }
    }

    for (let x = 0; x < width; x += step) {
        for (let y = 1; y < height; y += step) {
            const i = (y * width + x) * 4;
            const j = ((y - 1) * width + x) * 4;
            horizontalEdge[y] += Math.abs(luma(i) - luma(j));
        }
    }

    const smooth = (arr: number[], windowSize = 5) => {
        const half = Math.floor(windowSize / 2);
        return arr.map((_, i) => {
            let sum = 0;
            let count = 0;
            for (let k = -half; k <= half; k++) {
                const idx = i + k;
                if (idx >= 0 && idx < arr.length) {
                    sum += arr[idx];
                    count++;
                }
            }
            return count ? sum / count : 0;
        });
    };

    const vSmooth = smooth(verticalEdge, 7);
    const hSmooth = smooth(horizontalEdge, 7);

    const movingAverage = (arr: number[], windowSize: number) => {
        const w = Math.max(3, Math.floor(windowSize) | 1);
        const half = Math.floor(w / 2);
        const prefix: number[] = Array(arr.length + 1).fill(0);
        for (let i = 0; i < arr.length; i += 1) prefix[i + 1] = prefix[i] + arr[i];
        return arr.map((_, i) => {
            const lo = Math.max(0, i - half);
            const hi = Math.min(arr.length - 1, i + half);
            const sum = prefix[hi + 1] - prefix[lo];
            const denom = hi - lo + 1;
            return denom > 0 ? sum / denom : 0;
        });
    };

    const percentile = (arr: number[], p: number) => {
        if (arr.length === 0) return 0;
        const copy = [...arr].sort((a, b) => a - b);
        const idx = Math.max(0, Math.min(copy.length - 1, Math.round((copy.length - 1) * p)));
        return copy[idx];
    };

    const findActivityExtents = (arr: number[], axisSize: number) => {
        // Smooth into a "texture energy" signal so islands still contribute even if boundaries are sparse.
        const window = Math.max(13, Math.round(axisSize / 60) | 1);
        const energy = movingAverage(arr, window);
        const p90 = percentile(energy, 0.9);
        const p50 = percentile(energy, 0.5);
        const thr = p50 + (p90 - p50) * 0.35;

        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < energy.length; i += 1) {
            if (energy[i] >= thr) {
                if (i < min) min = i;
                if (i > max) max = i;
            }
        }
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
            return { min: 0, max: energy.length - 1, energy };
        }
        const pad = Math.min(24, Math.max(6, Math.round(axisSize / 90)));
        return {
            min: Math.max(0, Math.floor(min - pad)),
            max: Math.min(energy.length - 1, Math.ceil(max + pad)),
            energy,
        };
    };

    const xExtent = findActivityExtents(vSmooth, width);
    const yExtent = findActivityExtents(hSmooth, height);

    const scoreOffsetForSize = (
        arr: number[],
        size: number,
        preferredCount?: number
    ): { offset: number; score: number; runStart: number; runLen: number } => {
        let bestOffset = 0;
        let bestScore = -Infinity;
        let bestRunStart = 0;
        let bestRunLen = 0;

        for (let offset = 0; offset < size; offset += 1) {
            const samples: number[] = [];
            for (let pos = offset; pos < arr.length; pos += size) samples.push(arr[pos]);
            if (samples.length < 4) continue;

            // Adaptive threshold: prefer the strongest repeated boundaries.
            const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
            const variance = samples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / samples.length;
            const std = Math.sqrt(variance);
            const thr = mean + std * 0.35;

            let runStart = 0;
            let runLen = 0;
            let bestLocalStart = 0;
            let bestLocalLen = 0;
            let runSum = 0;
            let bestLocalSum = 0;

            for (let i = 0; i < samples.length; i += 1) {
                if (samples[i] >= thr) {
                    if (runLen === 0) runStart = i;
                    runLen += 1;
                    runSum += samples[i];
                    if (runLen > bestLocalLen || (runLen === bestLocalLen && runSum > bestLocalSum)) {
                        bestLocalLen = runLen;
                        bestLocalStart = runStart;
                        bestLocalSum = runSum;
                    }
                } else {
                    runLen = 0;
                    runSum = 0;
                }
            }

            // Score favors long consistent runs; gently boost if it matches the preferred row/col count.
            const cellCount = Math.max(0, bestLocalLen - 1);
            const matchBoost = preferredCount && cellCount === preferredCount ? 1.25 : 1;
            const avgRunStrength = bestLocalLen > 0 ? bestLocalSum / bestLocalLen : 0;
            const score = matchBoost * (bestLocalLen * 2 + avgRunStrength);

            if (score > bestScore) {
                bestScore = score;
                bestOffset = offset;
                bestRunStart = bestLocalStart;
                bestRunLen = bestLocalLen;
            }
        }

        return { offset: bestOffset, score: bestScore, runStart: bestRunStart, runLen: bestRunLen };
    };

    const findBestSpacing = (
        arr: number[],
        sizeHint?: number,
        preferredCount?: number,
        candidateSizes?: number[]
    ) => {
        const minSize = Math.max(10, Math.floor(Math.min(width, height) / 90));
        const maxSize = Math.min(180, Math.floor(Math.min(width, height) / 2));

        const sizes = (() => {
            if (sizeHint && Number.isFinite(sizeHint)) {
                const center = Math.round(sizeHint);
                const span = Math.max(6, Math.round(center * 0.18));
                const lo = Math.max(minSize, center - span);
                const hi = Math.min(maxSize, center + span);
                return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
            }
            if (candidateSizes && candidateSizes.length > 0) {
                const unique = Array.from(new Set(candidateSizes.map((v) => Math.round(v))))
                    .filter((v) => Number.isFinite(v) && v >= minSize && v <= maxSize)
                    .sort((a, b) => a - b);
                if (unique.length > 0) return unique;
            }
            return Array.from({ length: maxSize - minSize + 1 }, (_, i) => i + minSize);
        })();

        let bestSize = 0;
        let bestOffset = 0;
        let bestScore = -Infinity;
        let bestRunStart = 0;
        let bestRunLen = 0;

        for (const size of sizes) {
            const scored = scoreOffsetForSize(arr, size, preferredCount);
            if (scored.score > bestScore) {
                bestScore = scored.score;
                bestSize = size;
                bestOffset = scored.offset;
                bestRunStart = scored.runStart;
                bestRunLen = scored.runLen;
            }
        }

        return { size: bestSize, offset: bestOffset, score: bestScore, runStart: bestRunStart, runLen: bestRunLen };
    };

    const preferredCols = hints?.preferredCols;
    const preferredRows = hints?.preferredRows;

    // Only constrain size search when the user locks counts OR we have a learned cell-size profile.
    const sizeHintX = useDetectCurrentCounts
        ? (currentCols > 0 ? width / currentCols : undefined)
        : hints?.hintCellWidth;
    const sizeHintY = useDetectCurrentCounts
        ? (currentRows > 0 ? height / currentRows : undefined)
        : hints?.hintCellHeight;

    const findBestSpacingInRange = (
        arr: number[],
        rangeMin: number,
        rangeMax: number,
        sizeHint?: number,
        preferredCount?: number,
        candidateSizes?: number[]
    ) => {
        const start = Math.max(0, Math.min(arr.length - 1, rangeMin));
        const end = Math.max(start, Math.min(arr.length - 1, rangeMax));
        const sliced = arr.slice(start, end + 1);
        const res = findBestSpacing(sliced, sizeHint, preferredCount, candidateSizes);
        return { ...res, offsetAbs: start + res.offset, rangeStart: start, rangeEnd: end };
    };

    // Use the active extents to avoid background noise, but keep the full extents for counting (gap between islands).
    const makeCandidateSizes = (span: number, minCount: number, maxCount: number) => {
        const sizes: number[] = [];
        const safeSpan = Math.max(1, span);
        for (let count = minCount; count <= maxCount; count += 1) {
            const base = safeSpan / count;
            const center = Math.round(base);
            for (let d = -2; d <= 2; d += 1) sizes.push(center + d);
        }
        return sizes;
    };

    const xSpan = Math.max(1, xExtent.max - xExtent.min);
    const ySpan = Math.max(1, yExtent.max - yExtent.min);
    const xCandidates = makeCandidateSizes(xSpan, MIN_DETECTED_COLS, MAX_DETECTED_COLS);
    const yCandidates = makeCandidateSizes(ySpan, MIN_DETECTED_ROWS, MAX_DETECTED_ROWS);

    const xSpacing = findBestSpacingInRange(vSmooth, xExtent.min, xExtent.max, sizeHintX, preferredCols, xCandidates);
    const ySpacing = findBestSpacingInRange(hSmooth, yExtent.min, yExtent.max, sizeHintY, preferredRows, yCandidates);

    if (xSpacing.size <= 0 || ySpacing.size <= 0) {
        console.error('❌ Grid detection failed: no spacing candidates');
        return null;
    }

    // Use runStart to position the first strong boundary line when available.
    const adjustedOffsetX = xSpacing.runLen >= 3 ? xSpacing.offsetAbs + xSpacing.runStart * xSpacing.size : xSpacing.offsetAbs;
    const adjustedOffsetY = ySpacing.runLen >= 3 ? ySpacing.offsetAbs + ySpacing.runStart * ySpacing.size : ySpacing.offsetAbs;

    const snapGridToExtent = (
        extentMin: number,
        extentMax: number,
        size: number,
        offset: number,
        minCount: number,
        maxCount: number,
        preferredCount?: number
    ) => {
        const safeSize = Math.max(1, Math.round(size));
        const gridStart = Math.floor((extentMin - offset) / safeSize) * safeSize + offset;
        const gridEnd = Math.ceil((extentMax - offset) / safeSize) * safeSize + offset;
        const span = Math.max(safeSize, gridEnd - gridStart);
        let count = Math.max(1, Math.round(span / safeSize));
        if (preferredCount && Math.abs(preferredCount - count) <= 2) {
            count = preferredCount;
        }
        count = Math.max(minCount, Math.min(maxCount, count));
        return { gridStart, count };
    };

    const detectedColsFromExtent = snapGridToExtent(
        xExtent.min,
        xExtent.max,
        xSpacing.size,
        adjustedOffsetX,
        MIN_DETECTED_COLS,
        MAX_DETECTED_COLS,
        preferredCols
    );
    const detectedRowsFromExtent = snapGridToExtent(
        yExtent.min,
        yExtent.max,
        ySpacing.size,
        adjustedOffsetY,
        MIN_DETECTED_ROWS,
        MAX_DETECTED_ROWS,
        preferredRows
    );

    const derivedColsFromRun = xSpacing.runLen >= MIN_DETECTED_COLS + 1 ? (xSpacing.runLen - 1) : null;
    const derivedRowsFromRun = ySpacing.runLen >= MIN_DETECTED_ROWS + 1 ? (ySpacing.runLen - 1) : null;

    let finalCols = useDetectCurrentCounts ? currentCols : detectedColsFromExtent.count;
    let finalRows = useDetectCurrentCounts ? currentRows : detectedRowsFromExtent.count;
    let usedRunCounts = false;
    let usedRunCols = false;
    let usedRunRows = false;

    if (!useDetectCurrentCounts) {
        // Prefer the repeated-boundary run length (board region) over extents (background can pollute extents).
        if (derivedColsFromRun) {
            finalCols = Math.max(MIN_DETECTED_COLS, Math.min(MAX_DETECTED_COLS, derivedColsFromRun));
            usedRunCols = true;
        }
        if (derivedRowsFromRun) {
            finalRows = Math.max(MIN_DETECTED_ROWS, Math.min(MAX_DETECTED_ROWS, derivedRowsFromRun));
            usedRunRows = true;
        }
        usedRunCounts = usedRunCols || usedRunRows;

        // If this combination is unsafe, fall back to extents counts.
        if (finalRows * finalCols > MAX_DETECTED_CELLS) {
            finalCols = detectedColsFromExtent.count;
            finalRows = detectedRowsFromExtent.count;
            usedRunCounts = false;
            usedRunCols = false;
            usedRunRows = false;
        }
    }

    // Safety: never allow absurdly large grids (they can freeze the UI during cell analysis).
    if (finalRows * finalCols > MAX_DETECTED_CELLS) {
        console.error(`❌ Grid detection produced an unsafe cell count: ${finalRows}x${finalCols}`);
        return null;
    }

    console.log(`✓ Grid detected: ${finalRows}x${finalCols} (cell ~ ${xSpacing.size}px × ${ySpacing.size}px)`);

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const scoreBoundaries = (arr: number[], offset: number, size: number, count: number) => {
        let sum = 0;
        for (let i = 0; i <= count; i += 1) {
            const pos = Math.round(offset + i * size);
            if (pos >= 0 && pos < arr.length) sum += arr[pos];
        }
        return sum;
    };

    const refineOffset = (arr: number[], offset: number, size: number, count: number) => {
        const range = Math.min(10, Math.max(3, Math.round(size * 0.12)));
        let best = offset;
        let bestScore = scoreBoundaries(arr, offset, size, count);
        for (let d = -range; d <= range; d += 1) {
            const cand = offset + d;
            const s = scoreBoundaries(arr, cand, size, count);
            if (s > bestScore) {
                bestScore = s;
                best = cand;
            }
        }
        return best;
    };

    const baseOffsetX = useDetectCurrentCounts ? adjustedOffsetX : detectedColsFromExtent.gridStart;
    const baseOffsetY = useDetectCurrentCounts ? adjustedOffsetY : detectedRowsFromExtent.gridStart;
    // If we used run-derived counts, anchor the grid start to the first strong boundary in the run.
    const runStartOffsetX = xSpacing.runLen >= 3 ? (xSpacing.offsetAbs + xSpacing.runStart * xSpacing.size) : xSpacing.offsetAbs;
    const runStartOffsetY = ySpacing.runLen >= 3 ? (ySpacing.offsetAbs + ySpacing.runStart * ySpacing.size) : ySpacing.offsetAbs;
    const startOffsetX = usedRunCols ? runStartOffsetX : baseOffsetX;
    const startOffsetY = usedRunRows ? runStartOffsetY : baseOffsetY;
    const refinedOffsetX = refineOffset(vSmooth, startOffsetX, xSpacing.size, finalCols);
    const refinedOffsetY = refineOffset(hSmooth, startOffsetY, ySpacing.size, finalRows);

    const finalOffsetX = clamp(refinedOffsetX, 0, width - 1);
    const finalOffsetY = clamp(refinedOffsetY, 0, height - 1);

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const expectedBoundaryX = Math.max(2, finalCols + 1);
    const expectedBoundaryY = Math.max(2, finalRows + 1);
    const runFracX = clamp01(xSpacing.runLen / expectedBoundaryX);
    const runFracY = clamp01(ySpacing.runLen / expectedBoundaryY);
    // Heuristic confidence: mostly driven by how much of the expected boundary run we observed.
    let confidence = Math.min(runFracX, runFracY);
    if (!usedRunCounts) confidence *= 0.65;

    const durationMs = performance.now() - t0;
    return {
        rows: finalRows,
        cols: finalCols,
        offsetX: finalOffsetX,
        offsetY: finalOffsetY,
        cellWidth: xSpacing.size,
        cellHeight: ySpacing.size,
        runLenX: xSpacing.runLen,
        runLenY: ySpacing.runLen,
        scoreX: xSpacing.score,
        scoreY: ySpacing.score,
        confidence,
        durationMs,
        usedRunCounts,
    };
};
