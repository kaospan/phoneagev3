export type ReferenceQuality = {
    ok: boolean;
    axis: 'x' | 'y' | null;
    maxGrad: number;
    medianGrad: number;
    ratio: number;
    reason: string;
};

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const medianOf = (values: ArrayLike<number>) => {
    const arr = Array.from(values);
    if (arr.length === 0) return 0;
    arr.sort((a, b) => a - b);
    return arr[Math.floor(arr.length / 2)] ?? 0;
};

/**
 * Heuristic guard to avoid saving "reference sprites" that accidentally include
 * a border/gridline or pixels from a neighboring cell.
 *
 * This looks for a strong vertical/horizontal seam that spans most of the crop.
 * It is intentionally conservative: it only blocks very obvious seams.
 */
export const assessSingleCellReference = (img: ImageData): ReferenceQuality => {
    const w = img.width | 0;
    const h = img.height | 0;
    if (w <= 3 || h <= 3) {
        return { ok: false, axis: null, maxGrad: 0, medianGrad: 0, ratio: 0, reason: 'Capture too small.' };
    }

    const data = img.data;

    // Average absolute luminance diff between adjacent columns (per x) across the whole crop height.
    const colGrad = new Float32Array(Math.max(0, w - 1));
    for (let x = 0; x < w - 1; x += 1) {
        let sum = 0;
        for (let y = 0; y < h; y += 1) {
            const i1 = (y * w + x) * 4;
            const i2 = (y * w + x + 1) * 4;
            const l1 = luminance(data[i1], data[i1 + 1], data[i1 + 2]);
            const l2 = luminance(data[i2], data[i2 + 1], data[i2 + 2]);
            sum += Math.abs(l2 - l1);
        }
        colGrad[x] = sum / h;
    }

    // Average absolute luminance diff between adjacent rows (per y) across the whole crop width.
    const rowGrad = new Float32Array(Math.max(0, h - 1));
    for (let y = 0; y < h - 1; y += 1) {
        let sum = 0;
        const y0 = y;
        const y1 = y + 1;
        for (let x = 0; x < w; x += 1) {
            const i1 = (y0 * w + x) * 4;
            const i2 = (y1 * w + x) * 4;
            const l1 = luminance(data[i1], data[i1 + 1], data[i1 + 2]);
            const l2 = luminance(data[i2], data[i2 + 1], data[i2 + 2]);
            sum += Math.abs(l2 - l1);
        }
        rowGrad[y] = sum / w;
    }

    const colMedian = medianOf(colGrad);
    const rowMedian = medianOf(rowGrad);

    let colMax = 0;
    let colMaxIdx = 0;
    for (let i = 0; i < colGrad.length; i += 1) {
        if (colGrad[i] > colMax) {
            colMax = colGrad[i];
            colMaxIdx = i;
        }
    }
    let rowMax = 0;
    let rowMaxIdx = 0;
    for (let i = 0; i < rowGrad.length; i += 1) {
        if (rowGrad[i] > rowMax) {
            rowMax = rowGrad[i];
            rowMaxIdx = i;
        }
    }

    // Only treat a seam as "bad" if it appears inside the crop (not near its edges),
    // and is much stronger than typical texture variation.
    const colInteriorMin = Math.max(1, Math.floor(w * 0.18));
    const colInteriorMax = Math.min(w - 3, Math.ceil(w * 0.82));
    const rowInteriorMin = Math.max(1, Math.floor(h * 0.18));
    const rowInteriorMax = Math.min(h - 3, Math.ceil(h * 0.82));

    const colRatio = colMax / (colMedian + 0.001);
    const rowRatio = rowMax / (rowMedian + 0.001);

    const badColSeam =
        colMaxIdx >= colInteriorMin &&
        colMaxIdx <= colInteriorMax &&
        colMax > 26 &&
        (colMax - colMedian) > 18 &&
        colRatio > 3.3;

    const badRowSeam =
        rowMaxIdx >= rowInteriorMin &&
        rowMaxIdx <= rowInteriorMax &&
        rowMax > 26 &&
        (rowMax - rowMedian) > 18 &&
        rowRatio > 3.3;

    if (!badColSeam && !badRowSeam) {
        return { ok: true, axis: null, maxGrad: Math.max(colMax, rowMax), medianGrad: Math.max(colMedian, rowMedian), ratio: Math.max(colRatio, rowRatio), reason: 'OK' };
    }

    if (badColSeam && (!badRowSeam || colRatio >= rowRatio)) {
        return {
            ok: false,
            axis: 'x',
            maxGrad: colMax,
            medianGrad: colMedian,
            ratio: colRatio,
            reason: 'Looks like a vertical border or neighboring-cell bleed inside the capture.',
        };
    }

    return {
        ok: false,
        axis: 'y',
        maxGrad: rowMax,
        medianGrad: rowMedian,
        ratio: rowRatio,
        reason: 'Looks like a horizontal border or neighboring-cell bleed inside the capture.',
    };
};

