// Image normalization runs before the editor knows the true rows/cols.
// Keep this conservative: rotate if needed, trim real outer borders/HUD,
// but do not crop to any assumed grid dimensions.

const loadImage = async (imageURL: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${imageURL}`));
        image.src = imageURL;
    });
};

const ANALYSIS_MAX_DIM = 900;
const normalizedCache = new Map<string, string>();
const normalizedInFlight = new Map<string, Promise<string>>();
type NormalizedImageMetadata = {
    hudFooterDetected: boolean;
};
const normalizationMetadata = new Map<string, NormalizedImageMetadata>();

const NEAR_BLACK = 10;

const isNearBlack = (r: number, g: number, b: number) => r <= NEAR_BLACK && g <= NEAR_BLACK && b <= NEAR_BLACK;

const clampInt = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(value)));

const colorDistance = (r: number, g: number, b: number, bg: { r: number; g: number; b: number }) =>
    Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b);

const estimateBackgroundColor = (pixels: Uint8ClampedArray, width: number, height: number) => {
    const samples: Array<{ r: number; g: number; b: number }> = [];
    const points = [
        [2, 2],
        [width - 3, 2],
        [2, height - 3],
        [width - 3, height - 3],
        [Math.floor(width / 2), 2],
        [Math.floor(width / 2), height - 3],
    ];

    for (const [x, y] of points) {
        const sx = clampInt(x, 0, width - 1);
        const sy = clampInt(y, 0, height - 1);
        const index = (sy * width + sx) * 4;
        samples.push({ r: pixels[index], g: pixels[index + 1], b: pixels[index + 2] });
    }

    // Median-ish (sort by luma and pick middle) to reduce impact of UI chrome.
    const withLuma = samples
        .map((c) => ({ ...c, l: 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b }))
        .sort((a, b) => a.l - b.l);

    const mid = withLuma[Math.floor(withLuma.length / 2)];
    return { r: mid.r, g: mid.g, b: mid.b };
};

// Attempts to isolate the main "game viewport" rectangle inside larger screenshots (browser UI, margins, cookie banners).
// It looks for the longest vertical run of rows where the non-background content forms a stable, centered rectangle.
const cropCenterViewport = (pixels: Uint8ClampedArray, width: number, height: number) => {
    const bg = estimateBackgroundColor(pixels, width, height);
    const step = 4;
    const diffThreshold = 55;
    const minSegmentWidth = Math.floor(width * 0.35);
    const maxSegmentWidth = Math.floor(width * 0.92);
    const minRunRows = Math.max(40, Math.floor(height * 0.18));
    const toleranceX = Math.max(18, Math.floor(width * 0.03));

    const rows: Array<{ y: number; x0: number; x1: number; w: number }> = [];

    for (let y = 0; y < height; y += step) {
        let left = -1;
        let right = -1;

        for (let x = 0; x < width; x += step) {
            const index = (y * width + x) * 4;
            const dist = colorDistance(pixels[index], pixels[index + 1], pixels[index + 2], bg);
            if (dist > diffThreshold) {
                left = x;
                break;
            }
        }

        if (left === -1) continue;

        for (let x = width - 1; x >= 0; x -= step) {
            const index = (y * width + x) * 4;
            const dist = colorDistance(pixels[index], pixels[index + 1], pixels[index + 2], bg);
            if (dist > diffThreshold) {
                right = x;
                break;
            }
        }

        if (right <= left) continue;
        const segWidth = right - left + 1;
        if (segWidth < minSegmentWidth || segWidth > maxSegmentWidth) continue;

        rows.push({ y, x0: left, x1: right, w: segWidth });
    }

    if (rows.length === 0) return null;

    // Find the longest run with stable x0/x1 (viewport borders stay roughly constant).
    let best: { start: number; end: number } | null = null;
    let runStart = 0;

    for (let i = 1; i <= rows.length; i += 1) {
        const isBreak =
            i === rows.length ||
            rows[i].y - rows[i - 1].y > step * 2 ||
            Math.abs(rows[i].x0 - rows[i - 1].x0) > toleranceX ||
            Math.abs(rows[i].x1 - rows[i - 1].x1) > toleranceX;

        if (isBreak) {
            const runEnd = i - 1;
            const runRows = runEnd - runStart + 1;
            if (runRows * step >= minRunRows) {
                if (!best || runRows > best.end - best.start + 1) {
                    best = { start: runStart, end: runEnd };
                }
            }
            runStart = i;
        }
    }

    if (!best) return null;

    const slice = rows.slice(best.start, best.end + 1);
    const xs0 = slice.map((r) => r.x0).sort((a, b) => a - b);
    const xs1 = slice.map((r) => r.x1).sort((a, b) => a - b);
    const medianX0 = xs0[Math.floor(xs0.length / 2)];
    const medianX1 = xs1[Math.floor(xs1.length / 2)];

    const y0 = slice[0].y;
    const y1 = slice[slice.length - 1].y;

    const cropLeft = clampInt(medianX0 - step, 0, width - 1);
    const cropRight = clampInt(medianX1 + step, 0, width - 1);
    const cropTop = clampInt(y0 - step * 2, 0, height - 1);
    const cropBottom = clampInt(y1 + step * 2, 0, height - 1);

    const cropW = cropRight - cropLeft + 1;
    const cropH = cropBottom - cropTop + 1;

    // Sanity: avoid tiny/incorrect crops.
    if (cropW < width * 0.4 || cropH < height * 0.25) return null;

    return { left: cropLeft, top: cropTop, width: cropW, height: cropH };
};

const isMostlyBlackRow = (
    pixels: Uint8ClampedArray,
    width: number,
    y: number,
    startX: number,
    endX: number,
    threshold = 0.985
) => {
    let dark = 0;
    let total = 0;
    for (let x = startX; x <= endX; x += 1) {
        const index = (y * width + x) * 4;
        if (isNearBlack(pixels[index], pixels[index + 1], pixels[index + 2])) dark += 1;
        total += 1;
    }
    return total > 0 && dark / total >= threshold;
};

const getBlackRowRatio = (
    pixels: Uint8ClampedArray,
    width: number,
    y: number,
    startX: number,
    endX: number
) => {
    let dark = 0;
    let total = 0;
    for (let x = startX; x <= endX; x += 1) {
        const index = (y * width + x) * 4;
        if (isNearBlack(pixels[index], pixels[index + 1], pixels[index + 2])) dark += 1;
        total += 1;
    }
    return total > 0 ? dark / total : 0;
};

const isMostlyBlackColumn = (
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    startY: number,
    endY: number,
    threshold = 0.985
) => {
    let dark = 0;
    let total = 0;
    for (let y = startY; y <= endY; y += 1) {
        const index = (y * width + x) * 4;
        if (isNearBlack(pixels[index], pixels[index + 1], pixels[index + 2])) dark += 1;
        total += 1;
    }
    return total > 0 && dark / total >= threshold;
};

const estimateCornerBackground = (pixels: Uint8ClampedArray, width: number, height: number) => {
    const points = [
        [2, 2],
        [width - 3, 2],
        [2, height - 3],
        [width - 3, height - 3],
    ];

    const samples = points.map(([x, y]) => {
        const sx = clampInt(x, 0, width - 1);
        const sy = clampInt(y, 0, height - 1);
        const index = (sy * width + sx) * 4;
        return { r: pixels[index], g: pixels[index + 1], b: pixels[index + 2] };
    });

    const withLuma = samples
        .map((c) => ({ ...c, l: 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b }))
        .sort((a, b) => a.l - b.l);

    const mid = withLuma[Math.floor(withLuma.length / 2)];
    return { r: mid.r, g: mid.g, b: mid.b };
};

const cropBlackEdges = (
    pixels: Uint8ClampedArray,
    width: number,
    height: number
) => {
    let left = 0;
    let right = width - 1;
    let top = 0;
    let bottom = height - 1;
    // Only trim small uniform borders (avoid chopping off isolated tiles near the edges).
    const maxHorizontalTrim = Math.floor(width * 0.07);
    const maxVerticalTrim = Math.floor(height * 0.07);

    const cornerBg = estimateCornerBackground(pixels, width, height);
    const bgDist = 18;
    const bgThreshold = 0.992;

    const isMostlyBackgroundRow = (y: number, startX: number, endX: number) => {
        let bg = 0;
        let total = 0;
        for (let x = startX; x <= endX; x += 1) {
            const index = (y * width + x) * 4;
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            const dist = colorDistance(r, g, b, cornerBg);
            if (dist <= bgDist) bg += 1;
            total += 1;
        }
        return total > 0 && bg / total >= bgThreshold;
    };

    const isMostlyBackgroundColumn = (x: number, startY: number, endY: number) => {
        let bg = 0;
        let total = 0;
        for (let y = startY; y <= endY; y += 1) {
            const index = (y * width + x) * 4;
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            const dist = colorDistance(r, g, b, cornerBg);
            if (dist <= bgDist) bg += 1;
            total += 1;
        }
        return total > 0 && bg / total >= bgThreshold;
    };

    while (left < right && left < maxHorizontalTrim && isMostlyBackgroundColumn(left, top, bottom)) {
        left += 1;
    }
    while (right > left && width - 1 - right < maxHorizontalTrim && isMostlyBackgroundColumn(right, top, bottom)) {
        right -= 1;
    }
    while (top < bottom && top < maxVerticalTrim && isMostlyBackgroundRow(top, left, right)) {
        top += 1;
    }
    while (bottom > top && height - 1 - bottom < maxVerticalTrim && isMostlyBackgroundRow(bottom, left, right)) {
        bottom -= 1;
    }

    return { left, top, width: right - left + 1, height: bottom - top + 1 };
};

const findHudCutRow = (pixels: Uint8ClampedArray, width: number, height: number): number | null => {
    const minY = Math.floor(height * 0.62);
    const minHudHeight = Math.max(24, Math.floor(height * 0.07));
    const maxHudHeight = Math.max(minHudHeight, Math.floor(height * 0.28));
    const separatorDarkRatio = 0.74;
    const separatorSupportRatio = 0.62;
    const mostlyBlackThreshold = 0.92;

    const hasHudLikeContentBelow = (separatorY: number) => {
        const hudTop = separatorY + 1;
        const hudHeight = height - hudTop;
        if (hudHeight < minHudHeight || hudHeight > maxHudHeight) return false;

        let nonBlackRows = 0;
        let fullyBlackRows = 0;
        let totalRows = 0;

        for (let y = hudTop; y < height; y += 1) {
            const darkRatio = getBlackRowRatio(pixels, width, y, 0, width - 1);
            if (darkRatio >= mostlyBlackThreshold) fullyBlackRows += 1;
            else nonBlackRows += 1;
            totalRows += 1;
        }

        if (totalRows === 0) return false;

        // A real DOS footer should contain structured UI pixels below the separator.
        const contentRatio = nonBlackRows / totalRows;
        const blackRatio = fullyBlackRows / totalRows;
        return contentRatio >= 0.45 && blackRatio <= 0.55;
    };

    for (let y = height - minHudHeight - 1; y >= minY; y -= 1) {
        const darkRatio = getBlackRowRatio(pixels, width, y, 0, width - 1);
        const prevDarkRatio = y > 0 ? getBlackRowRatio(pixels, width, y - 1, 0, width - 1) : darkRatio;
        const nextDarkRatio = y < height - 1 ? getBlackRowRatio(pixels, width, y + 1, 0, width - 1) : darkRatio;

        // Accept either a strong separator row or a short dark run above the footer.
        const looksLikeSeparator =
            darkRatio >= separatorDarkRatio ||
            ((darkRatio >= separatorSupportRatio && nextDarkRatio >= separatorSupportRatio) ||
                (darkRatio >= separatorSupportRatio && prevDarkRatio >= separatorSupportRatio));

        if (!looksLikeSeparator) continue;
        if (hasHudLikeContentBelow(y)) return y;
    }

    return null;
};

const canvasToObjectURL = async (canvas: HTMLCanvasElement): Promise<string> => {
    // `toBlob` is async and avoids the big sync memory hit of `toDataURL`.
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return canvas.toDataURL('image/png');
    return URL.createObjectURL(blob);
};

const setNormalizationMetadata = (
    sourceUrl: string,
    normalizedUrl: string,
    metadata: NormalizedImageMetadata
) => {
    normalizationMetadata.set(sourceUrl, metadata);
    normalizationMetadata.set(normalizedUrl, metadata);
};

export const getImageNormalizationMetadata = (
    imageURL: string | null | undefined
): NormalizedImageMetadata | null => {
    if (!imageURL) return null;
    return normalizationMetadata.get(imageURL) ?? null;
};

export const normalizeMapperImage = async (imageURL: string): Promise<string> => {
    const cached = normalizedCache.get(imageURL);
    if (cached) return cached;
    const inflight = normalizedInFlight.get(imageURL);
    if (inflight) return inflight;

    const task = (async () => {
        try {
            const image = await loadImage(imageURL);
            const rotatedCanvas = document.createElement('canvas');
            const shouldRotate = image.width < image.height;
            rotatedCanvas.width = shouldRotate ? image.height : image.width;
            rotatedCanvas.height = shouldRotate ? image.width : image.height;

            const rotatedContext = rotatedCanvas.getContext('2d');
            if (!rotatedContext) return imageURL;

            if (shouldRotate) {
                rotatedContext.translate(rotatedCanvas.width, 0);
                rotatedContext.rotate(Math.PI / 2);
            }
            rotatedContext.drawImage(image, 0, 0);

            // Analyze a downscaled copy to avoid huge synchronous `getImageData` calls on 1080p+ images.
            const maxDim = Math.max(rotatedCanvas.width, rotatedCanvas.height);
            const analysisScale = Math.min(1, ANALYSIS_MAX_DIM / Math.max(1, maxDim));
            const analysisW = Math.max(1, Math.round(rotatedCanvas.width * analysisScale));
            const analysisH = Math.max(1, Math.round(rotatedCanvas.height * analysisScale));

            const analysisCanvas = document.createElement('canvas');
            analysisCanvas.width = analysisW;
            analysisCanvas.height = analysisH;
            const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
            if (!analysisCtx) return imageURL;
            analysisCtx.drawImage(rotatedCanvas, 0, 0, rotatedCanvas.width, rotatedCanvas.height, 0, 0, analysisW, analysisH);

            const analysisPixels = analysisCtx.getImageData(0, 0, analysisW, analysisH).data;

            // NOTE: Do not apply "center viewport" cropping here. Levels like 7 can have multiple separated islands;
            // viewport-crop heuristics can mistakenly discard off-center content.
            const borderCrop = cropBlackEdges(analysisPixels, analysisW, analysisH);

            // Map border crop back to full-res rotated canvas.
            const pad = 2;
            const cropLeft = clampInt(Math.floor(borderCrop.left / analysisScale) - pad, 0, rotatedCanvas.width - 1);
            const cropTop = clampInt(Math.floor(borderCrop.top / analysisScale) - pad, 0, rotatedCanvas.height - 1);
            const cropRight = clampInt(Math.ceil((borderCrop.left + borderCrop.width) / analysisScale) + pad, 1, rotatedCanvas.width);
            const cropBottom = clampInt(Math.ceil((borderCrop.top + borderCrop.height) / analysisScale) + pad, 1, rotatedCanvas.height);
            const croppedWidth = Math.max(1, cropRight - cropLeft);
            const croppedHeight = Math.max(1, cropBottom - cropTop);

            const workingCanvas = document.createElement('canvas');
            workingCanvas.width = croppedWidth;
            workingCanvas.height = croppedHeight;
            const workingCtx = workingCanvas.getContext('2d');
            if (!workingCtx) return imageURL;

            workingCtx.drawImage(rotatedCanvas, cropLeft, cropTop, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);

            // Optional HUD crop (DOS status bar) using downscaled analysis of the already-cropped image.
            let finalHeight = croppedHeight;
            if (croppedHeight > 120) {
                const workMaxDim = Math.max(croppedWidth, croppedHeight);
                const workScale = Math.min(1, ANALYSIS_MAX_DIM / Math.max(1, workMaxDim));
                const workW = Math.max(1, Math.round(croppedWidth * workScale));
                const workH = Math.max(1, Math.round(croppedHeight * workScale));
                const hudCanvas = document.createElement('canvas');
                hudCanvas.width = workW;
                hudCanvas.height = workH;
                const hudCtx = hudCanvas.getContext('2d', { willReadFrequently: true });
                if (hudCtx) {
                    hudCtx.drawImage(workingCanvas, 0, 0, croppedWidth, croppedHeight, 0, 0, workW, workH);
                    const hudPixels = hudCtx.getImageData(0, 0, workW, workH).data;
                    const hudCutRow = findHudCutRow(hudPixels, workW, workH);
                    if (hudCutRow) {
                        finalHeight = clampInt(Math.round(hudCutRow / workScale), 1, croppedHeight);
                    }
                }
            }

            // If nothing changes, keep original URL to avoid unnecessary memory.
            const borderDidCrop =
                cropLeft !== 0 || cropTop !== 0 || croppedWidth !== rotatedCanvas.width || croppedHeight !== rotatedCanvas.height;
            const hudDidCrop = finalHeight !== croppedHeight;
            if (!shouldRotate && !borderDidCrop && !hudDidCrop) {
                setNormalizationMetadata(imageURL, imageURL, { hudFooterDetected: false });
                return imageURL;
            }

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = croppedWidth;
            finalCanvas.height = finalHeight;
            const finalCtx = finalCanvas.getContext('2d');
            if (!finalCtx) return imageURL;
            finalCtx.drawImage(workingCanvas, 0, 0, croppedWidth, finalHeight, 0, 0, croppedWidth, finalHeight);

            const normalizedUrl = await canvasToObjectURL(finalCanvas);
            setNormalizationMetadata(imageURL, normalizedUrl, { hudFooterDetected: hudDidCrop });
            return normalizedUrl;
        } catch {
            setNormalizationMetadata(imageURL, imageURL, { hudFooterDetected: false });
            return imageURL;
        }
    })();

    normalizedInFlight.set(imageURL, task);
    try {
        const result = await task;
        normalizedCache.set(imageURL, result);
        return result;
    } finally {
        normalizedInFlight.delete(imageURL);
    }
};
