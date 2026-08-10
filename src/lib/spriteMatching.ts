// Sprite matching utilities for cell detection

export interface CellReference {
    id: string;
    tileType: number;
    imageData: string; // base64
    timestamp: number;
    gridPosition?: { row: number; col: number };
    sourceName?: string;
    // When true, mass deletion in the mapper should not delete this reference.
    locked?: boolean;
}

export const STORAGE_KEY = 'stone-age-cell-references';
export const CELL_REFERENCES_UPDATED_EVENT = 'stone-age-cell-references-updated';

const notifyCellReferencesUpdated = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(CELL_REFERENCES_UPDATED_EVENT));
};

export const getCellReferences = (): CellReference[] => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    try {
        return JSON.parse(stored);
    } catch {
        return [];
    }
};

export const getReferencesForType = (tileType: number): CellReference[] => {
    return getCellReferences().filter(ref => ref.tileType === tileType);
};

export const saveCellReferences = (references: CellReference[]): void => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(references));
    notifyCellReferencesUpdated();
};

export const appendCellReferences = (
    references: CellReference[],
    maxPerType: number = 24
): CellReference[] => {
    const existing = getCellReferences();
    const merged = [...existing, ...references].sort((a, b) => a.timestamp - b.timestamp);
    const byType = new Map<number, CellReference[]>();

    merged.forEach((reference) => {
        const list = byType.get(reference.tileType) ?? [];
        list.push(reference);
        byType.set(reference.tileType, list);
    });

    const trimmed = Array.from(byType.values()).flatMap((list) =>
        list.slice(Math.max(0, list.length - maxPerType))
    );

    saveCellReferences(trimmed);
    return trimmed;
};

/**
 * Compare two images using pixel-by-pixel similarity
 * Returns a similarity score between 0 (completely different) and 1 (identical)
 * Uses adaptive threshold based on tile characteristics
 */
export const compareImages = async (
    imageData1: ImageData,
    imageData2: ImageData,
    threshold: number = 0.75
): Promise<number> => {
    // Ensure images are the same size
    if (imageData1.width !== imageData2.width || imageData1.height !== imageData2.height) {
        return 0;
    }

    const data1 = imageData1.data;
    const data2 = imageData2.data;
    const totalPixels = imageData1.width * imageData2.height;
    let similarPixels = 0;
    let totalDiff = 0;

    // Calculate average brightness to detect void/dark tiles
    let avgBrightness = 0;
    for (let i = 0; i < data1.length; i += 4) {
        const brightness = (data1[i] + data1[i + 1] + data1[i + 2]) / 3;
        avgBrightness += brightness;
    }
    avgBrightness /= totalPixels;

    // Adaptive tolerance based on tile type
    // Void (black) and Floor (tan) need lower tolerance for exact matches
    const isVoidOrFloor = avgBrightness < 50 || avgBrightness > 140;
    const pixelTolerance = isVoidOrFloor ? 20 : 30; // Stricter for void/floor

    // Compare each pixel (RGB, ignoring alpha)
    for (let i = 0; i < data1.length; i += 4) {
        const r1 = data1[i], g1 = data1[i + 1], b1 = data1[i + 2];
        const r2 = data2[i], g2 = data2[i + 1], b2 = data2[i + 2];

        // Calculate color difference (Euclidean distance)
        const diff = Math.sqrt(
            Math.pow(r1 - r2, 2) +
            Math.pow(g1 - g2, 2) +
            Math.pow(b1 - b2, 2)
        );

        totalDiff += diff;

        // Consider similar if difference is less than tolerance
        if (diff < pixelTolerance) {
            similarPixels++;
        }
    }

    const similarityScore = similarPixels / totalPixels;
    const avgDiff = totalDiff / totalPixels;

    // Boost score for very similar images (avgDiff < 10)
    const adjustedScore = avgDiff < 10 ? Math.min(1.0, similarityScore * 1.1) : similarityScore;

    return adjustedScore;
};

/**
 * Load an image from base64 and return ImageData
 */
export const loadImageData = async (base64Image: string): Promise<ImageData | null> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(null);
                return;
            }
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            resolve(imageData);
        };
        img.onerror = () => resolve(null);
        img.src = base64Image;
    });
};

/**
 * Extract cell image data from canvas
 */
export const extractCellImageData = (
    canvas: HTMLCanvasElement,
    x0: number,
    y0: number,
    x1: number,
    y1: number
): ImageData | null => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const width = x1 - x0;
    const height = y1 - y0;

    if (width <= 0 || height <= 0) return null;

    try {
        return ctx.getImageData(x0, y0, width, height);
    } catch (e) {
        console.error('Failed to extract cell image data:', e);
        return null;
    }
};

const transformImageData = (
    source: ImageData,
    targetWidth: number,
    targetHeight: number,
    rotation: 0 | 90 | 180 | 270
): ImageData | null => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = source.width;
    sourceCanvas.height = source.height;
    const sourceContext = sourceCanvas.getContext('2d');
    if (!sourceContext) return null;
    sourceContext.putImageData(source, 0, 0);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = rotation === 90 || rotation === 270 ? source.height : source.width;
    tempCanvas.height = rotation === 90 || rotation === 270 ? source.width : source.height;
    const tempContext = tempCanvas.getContext('2d');
    if (!tempContext) return null;

    tempContext.save();
    if (rotation === 90) {
        tempContext.translate(tempCanvas.width, 0);
        tempContext.rotate(Math.PI / 2);
    } else if (rotation === 180) {
        tempContext.translate(tempCanvas.width, tempCanvas.height);
        tempContext.rotate(Math.PI);
    } else if (rotation === 270) {
        tempContext.translate(0, tempCanvas.height);
        tempContext.rotate(-Math.PI / 2);
    }
    tempContext.drawImage(sourceCanvas, 0, 0);
    tempContext.restore();

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = targetWidth;
    outputCanvas.height = targetHeight;
    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) return null;

    outputContext.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
    return outputContext.getImageData(0, 0, targetWidth, targetHeight);
};

/**
 * Find best matching reference sprite for a cell
 * Returns the tile type of the best match, or null if no good match found
 * Uses adaptive thresholds based on tile type characteristics
 */
export const findBestMatch = async (
    cellImageData: ImageData,
    minSimilarity: number = 0.70 // Lower default for more flexible matching
): Promise<number | null> => {
    const references = getCellReferences();
    console.log(`Finding best match from ${references.length} references`);
    
    if (references.length === 0) {
        console.log('No reference sprites saved yet');
        return null;
    }

    // Calculate cell brightness to adapt threshold
    let cellBrightness = 0;
    for (let i = 0; i < cellImageData.data.length; i += 4) {
        cellBrightness += (cellImageData.data[i] + cellImageData.data[i + 1] + cellImageData.data[i + 2]) / 3;
    }
    cellBrightness /= (cellImageData.width * cellImageData.height);

    // Adaptive threshold based on brightness
    // Void (black, < 50) and Floor (tan, > 140) need higher similarity (0.80)
    // Stone and other textured tiles can use lower threshold (0.65)
    const adaptiveThreshold = (cellBrightness < 50 || cellBrightness > 140) ? 0.80 : 0.65;
    
    console.log(`Cell brightness: ${cellBrightness.toFixed(1)}, adaptive threshold: ${adaptiveThreshold}`);

    let bestMatch: { tileType: number; similarity: number } | null = null;

    for (const ref of references) {
        const refImageData = await loadImageData(ref.imageData);
        if (!refImageData) continue;
        const rotationVariants: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
        let similarity = 0;
        for (const rotation of rotationVariants) {
            const comparisonImageData = transformImageData(
                cellImageData,
                refImageData.width,
                refImageData.height,
                rotation
            );
            if (!comparisonImageData) continue;
            const rotatedSimilarity = await compareImages(comparisonImageData, refImageData);
            similarity = Math.max(similarity, rotatedSimilarity);
        }

        console.log(`  Comparing with type ${ref.tileType}: similarity ${(similarity * 100).toFixed(1)}%`);

        // Use adaptive threshold based on tile characteristics
        const threshold = Math.max(minSimilarity, adaptiveThreshold);
        
        if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
            bestMatch = { tileType: ref.tileType, similarity };
            console.log(`  New best match: type ${ref.tileType} (${(similarity * 100).toFixed(1)}%)`);
        }
    }

    if (bestMatch) {
        console.log(`✓ Best match found: type ${bestMatch.tileType} (${(bestMatch.similarity * 100).toFixed(1)}% similar)`);
    } else {
        console.log('✗ No match above threshold');
    }

    return bestMatch ? bestMatch.tileType : null;
};

export interface ReferenceImageData {
    tileType: number;
    imageData: ImageData;
}

export const findBestMatchFromReferences = async (
    cellImageData: ImageData,
    references: ReferenceImageData[],
    minSimilarity: number = 0.70
): Promise<number | null> => {
    if (references.length === 0) return null;

    let cellBrightness = 0;
    for (let i = 0; i < cellImageData.data.length; i += 4) {
        cellBrightness += (cellImageData.data[i] + cellImageData.data[i + 1] + cellImageData.data[i + 2]) / 3;
    }
    cellBrightness /= (cellImageData.width * cellImageData.height);

    const adaptiveThreshold = (cellBrightness < 50 || cellBrightness > 140) ? 0.80 : 0.65;
    let bestMatch: { tileType: number; similarity: number } | null = null;

    for (const ref of references) {
        const rotationVariants: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
        let similarity = 0;
        for (const rotation of rotationVariants) {
            const comparisonImageData = transformImageData(
                cellImageData,
                ref.imageData.width,
                ref.imageData.height,
                rotation
            );
            if (!comparisonImageData) continue;
            const rotatedSimilarity = await compareImages(comparisonImageData, ref.imageData);
            similarity = Math.max(similarity, rotatedSimilarity);
        }
        const threshold = Math.max(minSimilarity, adaptiveThreshold);

        if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
            bestMatch = { tileType: ref.tileType, similarity };
        }
    }

    return bestMatch ? bestMatch.tileType : null;
};

export const buildReferenceMatcher = async (
    minSimilarity: number = 0.70
): Promise<((cellImageData: ImageData) => Promise<number | null>) | null> => {
    const references = getCellReferences();
    if (references.length === 0) return null;

    const imageDataRefs: ReferenceImageData[] = [];
    for (const ref of references) {
        const imgData = await loadImageData(ref.imageData);
        if (!imgData) continue;
        imageDataRefs.push({ tileType: ref.tileType, imageData: imgData });
    }

    if (imageDataRefs.length === 0) return null;

    return (cellImageData: ImageData) => findBestMatchFromReferences(cellImageData, imageDataRefs, minSimilarity);
};
