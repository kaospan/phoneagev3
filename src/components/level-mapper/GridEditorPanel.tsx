import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowDownUp, ArrowLeftRight, Eye, EyeOff, Image as ImageIcon, Link2, Link2Off, Maximize2, Move, Redo2, Save, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { TILE_TYPES } from '@/lib/levelgrid';
import { useLevelMapper } from '@/components/level-mapper/useLevelMapper';
import Palette, { useTileSpriteUrls } from './Palette';
import { learnReferencesFromAlignedMap } from './learningOperations';
import type { DetectedGrid } from './gridDetection';
import { updateAlignmentProfile } from './alignmentProfile';
import { OVERLAY_IMAGE_SCALE_Y_BASE } from './overlayDefaults';

const GRID_EDITOR_LAYOUT = {
    rulerSizePx: 20,
    minCellSizePx: 12,
    maxCellSizePx: 80,
    viewportPaddingPx: 12,
    resizeHandleClearancePx: 24,
    logicalZoomBaseline: 0.95,
    stableToolbarHeightPx: 74,
    fallbackViewportHeightPx: 600,
    fallbackViewportHeightRatio: 0.65,
} as const;

type GridEditorSize = { width: number; height: number };

const getAvailableBoardSize = (viewport: GridEditorSize): GridEditorSize => {
    const reservedSpace =
        GRID_EDITOR_LAYOUT.rulerSizePx +
        GRID_EDITOR_LAYOUT.viewportPaddingPx * 2 +
        GRID_EDITOR_LAYOUT.resizeHandleClearancePx;

    return {
        width: Math.max(1, viewport.width - reservedSpace),
        height: Math.max(1, viewport.height - reservedSpace),
    };
};

const fitBoardToViewport = (
    available: GridEditorSize,
    aspect: GridEditorSize,
    zoom: number,
): GridEditorSize => {
    const aspectWidth = Math.max(1, aspect.width);
    const aspectHeight = Math.max(1, aspect.height);
    const widthLimitedByHeight = Math.floor(available.height * (aspectWidth / aspectHeight));
    const width = Math.max(
        1,
        Math.floor(
            Math.min(available.width, widthLimitedByHeight) *
            zoom *
            GRID_EDITOR_LAYOUT.logicalZoomBaseline,
        ),
    );

    return {
        width,
        height: Math.max(1, Math.floor(width * (aspectHeight / aspectWidth))),
    };
};

export const GridEditorPanel: React.FC = () => {
    const {
        allLevels, compareLevel,
        importLevelIndex,
        overlayEnabled, setOverlayEnabled, overlayOpacity, setOverlayOpacity,
        imageScaleX, setImageScaleX, imageScaleY, setImageScaleY, imageOffsetX, setImageOffsetX, imageOffsetY, setImageOffsetY, lockImageAspect, setLockImageAspect,
        lastGridDetection,
        saveChanges, undo, redo, canUndo, canRedo, isSaved, setIsSaved, lastSavedAt, lastSavedRepoStatus,
        hourglassBrushSeconds, setHourglassBonusByCell,
        rows, cols, grid, activeTile, setActiveTile, setGrid,
        pushUndo, pushUndoSnapshot,
        addMultipleColumns, addMultipleRows, contextMenu, setContextMenu,
        imageURL,
        canvasRef,
        playerStart, setPlayerStart,
        zoom, setZoom,
        gridOffsetX, setGridOffsetX, gridOffsetY, setGridOffsetY,
        gridFrameWidth, setGridFrameWidth, gridFrameHeight, setGridFrameHeight,
    } = useLevelMapper();

    const [isDragMode, setIsDragMode] = React.useState(false);
    const [isDraggingGrid, setIsDraggingGrid] = React.useState(false);
    const [isResizingImageX, setIsResizingImageX] = React.useState(false);
    const [isResizingImageY, setIsResizingImageY] = React.useState(false);
    const resizeXStartRef = React.useRef<{ x: number; scaleX: number; offsetX: number; direction: 1 | -1; rightPx?: number } | null>(null);
    const resizeYStartRef = React.useRef<{ y: number; scaleY: number; offsetY: number; direction: 1 | -1; bottomPx?: number } | null>(null);
    // Track cells the user manually painted/confirmed so learning can use trusted labels only.
    const trustedCellsRef = React.useRef<Set<string>>(new Set());
    const [guideGrid, setGuideGrid] = React.useState<null | {
        rows: number;
        cols: number;
        offsetX: number;
        offsetY: number;
        cellWidth: number;
        cellHeight: number;
    }>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [cellWidth, setCellWidth] = React.useState(32);
    const [cellHeight, setCellHeight] = React.useState(32);
    const [imageNaturalSize, setImageNaturalSize] = React.useState<{ width: number; height: number } | null>(null);
    const [displaySize, setDisplaySize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });

    const markUnsaved = React.useCallback(() => setIsSaved(false), [setIsSaved]);
    const isGridAllVoid = React.useMemo(
        () => grid.every((row) => row.every((tileId) => tileId === 5)),
        [grid],
    );

    const voidAllCells = React.useCallback(() => {
        if (isGridAllVoid) return;
        pushUndo();
        setGrid((currentGrid) => currentGrid.map((row) => row.map(() => 5)));
        setPlayerStart(null);
        setHourglassBonusByCell({});
        trustedCellsRef.current.clear();
    }, [isGridAllVoid, pushUndo, setGrid, setHourglassBonusByCell, setPlayerStart]);

    const updateHourglassMetaAt = React.useCallback(
        (row: number, col: number, tileId: number) => {
            const key = `${col},${row}`;
            setHourglassBonusByCell((prev) => {
                // Avoid extra re-renders when there's nothing to change.
                const had = Object.prototype.hasOwnProperty.call(prev, key);
                if (tileId === 20) {
                    const nextVal = Math.max(1, Math.min(86400, Math.round(Number(hourglassBrushSeconds) || 50)));
                    if (had && prev[key] === nextVal) return prev;
                    return { ...prev, [key]: nextVal };
                }
                if (!had) return prev;
                const next = { ...prev };
                delete next[key];
                return next;
            });
        },
        [setHourglassBonusByCell, hourglassBrushSeconds]
    );

    // Load overlay image size once per URL (prevents resize jitter).
    React.useEffect(() => {
        if (!imageURL) {
            setImageNaturalSize(null);
            setGuideGrid(null);
            return;
        }
        let cancelled = false;
        const img = new Image();
        img.onload = () => {
            if (cancelled) return;
            setImageNaturalSize({ width: img.width, height: img.height });
        };
        img.src = imageURL;
        return () => {
            cancelled = true;
        };
    }, [imageURL]);

    // Use the last Auto-detect result as the alignment guide (single source of truth).
    React.useEffect(() => {
        if (!overlayEnabled || !imageURL || !imageNaturalSize) {
            setGuideGrid(null);
            return;
        }
        if (!lastGridDetection) {
            setGuideGrid(null);
            return;
        }
        const asGuide = lastGridDetection as unknown as DetectedGrid;
        if (asGuide.rows !== rows || asGuide.cols !== cols) {
            setGuideGrid(null);
            return;
        }
        setGuideGrid(asGuide);
    }, [overlayEnabled, imageURL, imageNaturalSize, lastGridDetection, rows, cols]);

    // The editable board drives layout. Screenshot dimensions only determine how the
    // overlay maps into that stable board footprint after the image has loaded.
    React.useEffect(() => {
        const updateCellSize = () => {
            if (!containerRef.current) return;
            const fallbackHeight = typeof window !== 'undefined'
                ? Math.floor(window.innerHeight * GRID_EDITOR_LAYOUT.fallbackViewportHeightRatio)
                : GRID_EDITOR_LAYOUT.fallbackViewportHeightPx;
            const available = getAvailableBoardSize({
                width: containerRef.current.clientWidth,
                height: containerRef.current.clientHeight || fallbackHeight,
            });

            const commitLayout = (board: GridEditorSize, display: GridEditorSize = board) => {
                setCellWidth(board.width / cols);
                setCellHeight(board.height / rows);
                setDisplaySize((current) => (
                    current.width === display.width && current.height === display.height
                        ? current
                        : display
                ));
            };

            if (imageURL) {
                if (!imageNaturalSize) {
                    commitLayout(fitBoardToViewport(available, { width: cols, height: rows }, zoom));
                    return;
                }

                const imgW = imageNaturalSize.width;
                const imgH = imageNaturalSize.height;
                const framePixelWidth = gridFrameWidth ?? imgW;
                const framePixelHeight = gridFrameHeight ?? imgH;
                const board = fitBoardToViewport(available, {
                    width: gridFrameWidth ?? cols,
                    height: gridFrameHeight ?? rows,
                }, zoom);
                const imageScaleX = board.width / Math.max(1, framePixelWidth);
                const imageScaleY = board.height / Math.max(1, framePixelHeight);
                const display = {
                    width: Math.max(1, Math.floor(imgW * imageScaleX)),
                    height: Math.max(1, Math.floor(imgH * imageScaleY)),
                };

                // Keep X/Y independent so the grid can match screenshots whose tiles are a few pixels
                // wider or taller after capture, scaling, or DOS-era aspect distortion.
                commitLayout(board, display);
            } else {
                const fitted = fitBoardToViewport(available, { width: cols, height: rows }, zoom);
                const cellWidth = Math.max(
                    GRID_EDITOR_LAYOUT.minCellSizePx,
                    Math.min(fitted.width / cols, GRID_EDITOR_LAYOUT.maxCellSizePx),
                );
                const cellHeight = Math.max(
                    GRID_EDITOR_LAYOUT.minCellSizePx,
                    Math.min(fitted.height / rows, GRID_EDITOR_LAYOUT.maxCellSizePx),
                );
                commitLayout({
                    width: cellWidth * cols,
                    height: cellHeight * rows,
                });
                setImageNaturalSize(null);
            }
        };

        updateCellSize();
        let rafId: number | null = null;
        const resizeObserver = new ResizeObserver(() => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => updateCellSize());
        });
        resizeObserver.observe(containerRef.current);
        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            resizeObserver.disconnect();
        };
    }, [imageURL, imageNaturalSize, cols, rows, zoom, gridFrameHeight, gridFrameWidth]);

    const isPaintingRef = React.useRef(false);
    const didPushUndoRef = React.useRef(false);
    const dragStartRef = React.useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

    const scaledDisplayWidth = displaySize.width * imageScaleX;
    // Baseline vertical correction so typical "aligned" state is ~100%.
    const effectiveImageScaleY = imageScaleY * OVERLAY_IMAGE_SCALE_Y_BASE;
    const scaledDisplayHeight = displaySize.height * effectiveImageScaleY;
    const overlayScaleX = imageNaturalSize ? scaledDisplayWidth / imageNaturalSize.width : 1;
    const overlayScaleY = imageNaturalSize ? scaledDisplayHeight / imageNaturalSize.height : 1;
    const imageLeftPx = imageOffsetX * overlayScaleX;
    const imageTopPx = imageOffsetY * overlayScaleY;
    const imageRightPx = imageLeftPx + scaledDisplayWidth;
    const imageBottomPx = imageTopPx + scaledDisplayHeight;
    const displayOffsetX = gridOffsetX * overlayScaleX;
    const displayOffsetY = gridOffsetY * overlayScaleY;
    const naturalFrameWidth = gridFrameWidth ?? imageNaturalSize?.width ?? 0;
    const naturalFrameHeight = gridFrameHeight ?? imageNaturalSize?.height ?? 0;

    const alignment = React.useMemo(() => {
        if (!guideGrid || !overlayEnabled || !imageNaturalSize) return null;
        if (guideGrid.rows !== rows || guideGrid.cols !== cols) return null;

        const guideOffsetX = guideGrid.offsetX * overlayScaleX;
        const guideOffsetY = imageTopPx + guideGrid.offsetY * overlayScaleY;
        const guideCellW = guideGrid.cellWidth * overlayScaleX;
        const guideCellH = guideGrid.cellHeight * overlayScaleY;

        const v: { x: number; diff: number }[] = [];
        const h: { y: number; diff: number }[] = [];
        let sum = 0;
        let count = 0;
        let max = 0;

        for (let c = 0; c <= cols; c++) {
            const gx = displayOffsetX + c * cellWidth;
            const ix = guideOffsetX + c * guideCellW;
            const diff = Math.abs(gx - ix);
            v.push({ x: ix, diff });
            sum += diff; count++; max = Math.max(max, diff);
        }
        for (let r = 0; r <= rows; r++) {
            const gy = displayOffsetY + r * cellHeight;
            const iy = guideOffsetY + r * guideCellH;
            const diff = Math.abs(gy - iy);
            h.push({ y: iy, diff });
            sum += diff; count++; max = Math.max(max, diff);
        }

        const avg = count ? sum / count : 999;
        const aligned = avg < 0.6 && max < 1.2;
        return { aligned, avg, max, v, h, guideOffsetX, guideOffsetY, guideCellW, guideCellH };
    }, [
        guideGrid,
        overlayEnabled,
        imageNaturalSize,
        rows,
        cols,
        overlayScaleX,
        overlayScaleY,
        imageTopPx,
        displayOffsetX,
        displayOffsetY,
        cellWidth,
        cellHeight,
    ]);

    const maybeSnapToGuideGrid = React.useCallback(() => {
        if (!guideGrid || !alignment || !imageNaturalSize) return false;
        if (guideGrid.rows !== rows || guideGrid.cols !== cols) return false;
        if (alignment.avg > 1.4 || alignment.max > 3) return false;

        const nextOffsetX = Math.max(0, Math.min(imageNaturalSize.width - 1, Math.round(guideGrid.offsetX)));
        const nextOffsetY = Math.max(0, Math.min(imageNaturalSize.height - 1, Math.round(guideGrid.offsetY)));
        const nextFrameWidth = Math.min(imageNaturalSize.width, Math.max(1, Math.round(guideGrid.cellWidth * cols)));
        const nextFrameHeight = Math.min(imageNaturalSize.height, Math.max(1, Math.round(guideGrid.cellHeight * rows)));

        const changed =
            nextOffsetX !== gridOffsetX ||
            nextOffsetY !== gridOffsetY ||
            nextFrameWidth !== (gridFrameWidth ?? imageNaturalSize.width) ||
            nextFrameHeight !== (gridFrameHeight ?? imageNaturalSize.height);

        if (!changed) return false;

        setGridOffsetX(nextOffsetX);
        setGridOffsetY(nextOffsetY);
        setGridFrameWidth(nextFrameWidth);
        setGridFrameHeight(nextFrameHeight);
        return true;
    }, [
        alignment,
        cols,
        gridFrameHeight,
        gridFrameWidth,
        gridOffsetX,
        gridOffsetY,
        guideGrid,
        imageNaturalSize,
        rows,
        setGridFrameHeight,
        setGridFrameWidth,
        setGridOffsetX,
        setGridOffsetY,
    ]);

    const autoFitImageScaleY = React.useCallback(() => {
        if (!guideGrid || !imageNaturalSize) return;
        // Find scaleY that makes the detected tile height line up with the grid's cellHeight.
        // cellHeight is already based on the screenshot's detected frame; this just compensates for mild vertical distortion.
        const baseOverlayScaleY = (displaySize.height / imageNaturalSize.height) * OVERLAY_IMAGE_SCALE_Y_BASE;
        if (!Number.isFinite(baseOverlayScaleY) || baseOverlayScaleY <= 0) return;
        const wantedOverlayScaleY = cellHeight / guideGrid.cellHeight;
        if (!Number.isFinite(wantedOverlayScaleY) || wantedOverlayScaleY <= 0) return;
        const next = Math.max(0.85, Math.min(1.15, wantedOverlayScaleY / baseOverlayScaleY));
        pushUndoSnapshot();
        markUnsaved();
        setLockImageAspect(false);
        setImageScaleY(Number(next.toFixed(3)));
    }, [guideGrid, imageNaturalSize, displaySize.height, cellHeight, markUnsaved, pushUndoSnapshot, setImageScaleY, setLockImageAspect]);

    const beginResizeImageX = React.useCallback((clientX: number, direction: 1 | -1) => {
        pushUndoSnapshot();
        markUnsaved();
        setLockImageAspect(false);
        const rightPx = direction === -1 && imageNaturalSize ? (imageOffsetX + imageNaturalSize.width) * overlayScaleX : undefined;
        resizeXStartRef.current = { x: clientX, scaleX: imageScaleX, offsetX: imageOffsetX, direction, rightPx };
        setIsResizingImageX(true);
    }, [imageScaleX, imageOffsetX, imageNaturalSize, markUnsaved, overlayScaleX, pushUndoSnapshot, setLockImageAspect]);

    const moveResizeImageX = React.useCallback((clientX: number) => {
        const start = resizeXStartRef.current;
        if (!start) return;
        const dx = (clientX - start.x) * start.direction;
        const denom = Math.max(1, scaledDisplayWidth);
        const next = start.scaleX * (1 + dx / denom);
        const clamped = Math.max(0.85, Math.min(1.15, next));
        setImageScaleX(Number(clamped.toFixed(3)));
        if (start.direction === -1 && start.rightPx != null && imageNaturalSize && displaySize.width > 0) {
            const imgW = imageNaturalSize.width;
            const nextOverlayScaleX = (displaySize.width * clamped) / imgW;
            if (Number.isFinite(nextOverlayScaleX) && nextOverlayScaleX > 0) {
                const nextOffsetX = start.rightPx / nextOverlayScaleX - imgW;
                setImageOffsetX(Math.max(0, Number(nextOffsetX.toFixed(2))));
            }
        }
    }, [scaledDisplayWidth, imageNaturalSize, displaySize.width, setImageOffsetX, setImageScaleX]);

    const endResizeImageX = React.useCallback(() => {
        resizeXStartRef.current = null;
        setIsResizingImageX(false);
        maybeSnapToGuideGrid();
    }, [maybeSnapToGuideGrid]);

    const beginResizeImageY = React.useCallback((clientY: number, direction: 1 | -1) => {
        pushUndoSnapshot();
        markUnsaved();
        setLockImageAspect(false);
        const bottomPx = direction === -1 && imageNaturalSize ? (imageOffsetY + imageNaturalSize.height) * overlayScaleY : undefined;
        resizeYStartRef.current = { y: clientY, scaleY: imageScaleY, offsetY: imageOffsetY, direction, bottomPx };
        setIsResizingImageY(true);
    }, [imageScaleY, imageOffsetY, imageNaturalSize, markUnsaved, overlayScaleY, pushUndoSnapshot, setLockImageAspect]);

    const moveResizeImageY = React.useCallback((clientY: number) => {
        const start = resizeYStartRef.current;
        if (!start) return;
        // Direction makes "drag away from the edge" increase size for both top and bottom handles.
        const dy = (clientY - start.y) * start.direction;
        const denom = Math.max(1, scaledDisplayHeight);
        const next = start.scaleY * (1 + dy / denom);
        const clamped = Math.max(0.85, Math.min(1.15, next));
        setImageScaleY(Number(clamped.toFixed(3)));
        if (start.direction === -1 && start.bottomPx != null && imageNaturalSize && displaySize.height > 0) {
            // Keep the bottom edge fixed when resizing from the top handle so "void" appears on top.
            const imgH = imageNaturalSize.height;
            const nextOverlayScaleY = (displaySize.height * clamped * OVERLAY_IMAGE_SCALE_Y_BASE) / imgH;
            if (Number.isFinite(nextOverlayScaleY) && nextOverlayScaleY > 0) {
                const nextOffsetY = start.bottomPx / nextOverlayScaleY - imgH;
                setImageOffsetY(Math.max(0, Number(nextOffsetY.toFixed(2))));
            }
        }
    }, [scaledDisplayHeight, imageNaturalSize, displaySize.height, setImageOffsetY, setImageScaleY]);

    const endResizeImageY = React.useCallback(() => {
        resizeYStartRef.current = null;
        setIsResizingImageY(false);
        maybeSnapToGuideGrid();
    }, [maybeSnapToGuideGrid]);

    const beginPaint = (r: number, c: number) => {
        if (isDragMode) return;

        const applyStartCaveAt = (row: number, col: number) => {
            if (!didPushUndoRef.current) { pushUndo(); didPushUndoRef.current = true; }
            setPlayerStart({ x: col, y: row });
            updateHourglassMetaAt(row, col, 18);
            setGrid((g) => {
                const ng = g.map((rr) => [...rr]);

                // Ensure only one start marker exists.
                for (let y = 0; y < ng.length; y += 1) {
                    for (let x = 0; x < (ng[y]?.length ?? 0); x += 1) {
                        if (y === row && x === col) continue;
                        if (ng[y][x] === 18) ng[y][x] = 0;
                    }
                }

                if (ng[row] && ng[row][col] !== undefined) ng[row][col] = 18;
                return ng;
            });
            trustedCellsRef.current.add(`${row},${col}`);
        };

        // Painting a START CAVE tile is equivalent to setting player start.
        if (activeTile === 18) {
            applyStartCaveAt(r, c);
            return;
        }

        isPaintingRef.current = true;
        if (!didPushUndoRef.current) { pushUndo(); didPushUndoRef.current = true; }

        // If the user paints over the current player start, clear the marker to avoid a later save overwriting it back to 18.
        if (playerStart?.x === c && playerStart?.y === r) {
            setPlayerStart(null);
        }

        setGrid(g => {
            const ng = g.map(row => [...row]);
            if (ng[r] && ng[r][c] !== undefined) ng[r][c] = activeTile;
            return ng;
        });
        updateHourglassMetaAt(r, c, activeTile);
        trustedCellsRef.current.add(`${r},${c}`);
    };
    const continuePaint = (r: number, c: number) => {
        if (isDragMode) return;
        if (!isPaintingRef.current) return;

        if (activeTile !== 18 && playerStart?.x === c && playerStart?.y === r) {
            setPlayerStart(null);
        }

        setGrid(g => {
            const ng = g.map(row => [...row]);
            if (ng[r] && ng[r][c] !== undefined) ng[r][c] = activeTile;
            return ng;
        });
        updateHourglassMetaAt(r, c, activeTile);
        trustedCellsRef.current.add(`${r},${c}`);
    };
    const endPaint = () => { isPaintingRef.current = false; didPushUndoRef.current = false; };

    const startGridDrag = (clientX: number, clientY: number) => {
        if (!isDragMode || !imageURL) return;
        pushUndoSnapshot();
        markUnsaved();
        setIsDraggingGrid(true);
        dragStartRef.current = {
            x: clientX,
            y: clientY,
            offsetX: gridOffsetX,
            offsetY: gridOffsetY,
        };
    };

    const moveGridDrag = (clientX: number, clientY: number) => {
        if (!isDraggingGrid || !imageNaturalSize) return;

        const deltaX = clientX - dragStartRef.current.x;
        const deltaY = clientY - dragStartRef.current.y;
        const nextOffsetX = dragStartRef.current.offsetX + deltaX / overlayScaleX;
        const nextOffsetY = dragStartRef.current.offsetY + deltaY / overlayScaleY;

        setGridOffsetX(Math.round(nextOffsetX));
        setGridOffsetY(Math.round(nextOffsetY));
    };

    const endGridDrag = () => {
        setIsDraggingGrid(false);
        maybeSnapToGuideGrid();
    };

    const onWheelZoom = (e: React.WheelEvent) => {
        if (!imageURL || !overlayEnabled) return;
        // Keep normal scrolling unless you're actively aligning.
        if (!isDragMode && !e.altKey && !e.ctrlKey && !e.metaKey) return;
        if (!e.deltaY) return;
        e.preventDefault();

        // Fine-tune overlay image scale without changing the grid.
        if (e.altKey) {
            markUnsaved();
            // Default: tiny increments. If you want bigger jumps, hold Alt+Meta (Mac) or Alt+Ctrl (Win/Linux) while NOT stretching an axis.
            const step = 0.002;
            const delta = e.deltaY > 0 ? -step : step;

            // Alt + wheel: uniform scale (locked), unless Ctrl or Shift is held for axis-specific stretch.
            const nextScale = (current: number) => Math.max(0.85, Math.min(1.15, Number((current + delta).toFixed(3))));

            if (e.ctrlKey) {
                setLockImageAspect(false);
                setImageScaleY(nextScale(imageScaleY));
            } else if (e.shiftKey) {
                setLockImageAspect(false);
                setImageScaleX(nextScale(imageScaleX));
            } else {
                setImageScaleX(nextScale(imageScaleX));
                setImageScaleY(nextScale(imageScaleY));
            }
            return;
        }

        const sensitivity = e.shiftKey ? 0.003 : 0.0015;
        const factor = Math.exp(-e.deltaY * sensitivity);
        setZoom(Math.max(0.5, Math.min(2, Number((zoom * factor).toFixed(2)))));
    };

    const learnCurrentMap = async (options?: { silent?: boolean }) => {
        if (!imageURL || !imageNaturalSize) {
            alert('Load an aligned image first');
            return;
        }

        const trusted = Array.from(trustedCellsRef.current);
        if (trusted.length === 0) {
            if (!options?.silent) {
                alert('No manually confirmed cells yet. Paint/place a few tiles first, then Learn.');
            }
            return;
        }

        const learnedCount = await learnReferencesFromAlignedMap({
            imageURL,
            grid,
            frame: {
                offsetX: gridOffsetX,
                offsetY: gridOffsetY,
                width: naturalFrameWidth,
                height: naturalFrameHeight,
            },
            levelLabel: importLevel ? `level-${importLevel.id}` : 'mapper-current',
            trustedCells: trusted,
        });

        if (!options?.silent) {
            alert(`Learned ${learnedCount} reference cells from the current map`);
        }
    };

    const saveCurrentMap = async () => {
        if (imageURL && imageNaturalSize && trustedCellsRef.current.size > 0) {
            try {
                await learnCurrentMap({ silent: true });
            } catch (error) {
                console.error('Failed to learn from current map before saving:', error);
            }
        }
        if (imageNaturalSize && rows > 0 && cols > 0) {
            const frameW = gridFrameWidth ?? imageNaturalSize.width;
            const frameH = gridFrameHeight ?? imageNaturalSize.height;
            updateAlignmentProfile({ cellWidthPx: frameW / cols, cellHeightPx: frameH / rows, cols, rows });
        }
        await saveChanges();
        trustedCellsRef.current.clear();
    };

    // Get the import level info for display
    const importLevel = importLevelIndex !== null && importLevelIndex !== undefined ? allLevels[importLevelIndex] : null;
    const selectedTile = TILE_TYPES.find((t) => t.id === activeTile) ?? TILE_TYPES[0];
    const tileSpriteUrls = useTileSpriteUrls();
    const selectedTileSprite = tileSpriteUrls[selectedTile.id];
    const rulerSizePx = GRID_EDITOR_LAYOUT.rulerSizePx;
    const gridRightPx = displayOffsetX + cols * cellWidth;
    const gridBottomPx = displayOffsetY + rows * cellHeight;
    const contentWidthPx = Math.max(imageRightPx, gridRightPx, cols * cellWidth);
    const contentHeightPx = Math.max(imageBottomPx, gridBottomPx, rows * cellHeight);
    const compactIconButtonClass = "h-6 w-6 [&_svg]:h-3.5 [&_svg]:w-3.5";
    const compactButtonClass = "h-7 px-2 text-xs";
    const sliderClass = "w-14 sm:w-16";
    const toolRowClass = "flex flex-wrap items-center gap-1 rounded-lg border border-border/60 bg-background/20 p-0.5";

    return (
        <div className="flex w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/95 p-1 shadow-sm">
            <div
                className="shrink-0 overflow-x-auto rounded-md border border-border/50 bg-background/10 p-0.5"
                style={{ minHeight: GRID_EDITOR_LAYOUT.stableToolbarHeightPx }}
            >
                <div className="grid gap-0.5">
                <div className={toolRowClass}>
                    <Button size="icon" variant="outline" className={compactIconButtonClass} onClick={undo} disabled={!canUndo} title="Undo" aria-label="Undo">
                        <Undo2 />
                    </Button>
                    <Button size="icon" variant="outline" className={compactIconButtonClass} onClick={redo} disabled={!canRedo} title="Redo" aria-label="Redo">
                        <Redo2 />
                    </Button>
                    <Button
                        size="icon"
                        variant="outline"
                        className={compactIconButtonClass}
                        onClick={voidAllCells}
                        disabled={isGridAllVoid}
                        title="Set all cells to Void"
                        aria-label="Set all cells to Void"
                    >
                        <Trash2 />
                    </Button>
                    <Button
                        size="sm"
                        variant="default"
                        className="h-6 px-2 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-900/30 disabled:text-emerald-100/60"
                        onClick={() => { void saveCurrentMap(); }}
                        disabled={isSaved}
                        title={isSaved ? "Saved" : "Save changes (also learns references if overlay is loaded)"}
                        aria-label="Save Changes"
                    >
                        <Save className="mr-1 h-3.5 w-3.5" />
                        {isSaved ? 'Saved' : 'Save'}
                    </Button>
                    {lastSavedAt !== null && (
                        <span
                            className="flex items-center gap-1 whitespace-nowrap rounded-md border border-border/60 bg-background/40 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
                            title={new Date(lastSavedAt).toLocaleString()}
                        >
                            <span>
                                Last saved {new Date(lastSavedAt).toLocaleString(undefined, {
                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
                                })}
                            </span>
                            {lastSavedRepoStatus === 'saved' && (
                                <span
                                    className="font-semibold text-emerald-500"
                                    title="This save overwrote the canonical repo default in src/data/promoted-levels.json"
                                >
                                    · overrode default DB
                                </span>
                            )}
                            {lastSavedRepoStatus === 'failed' && (
                                <span
                                    className="font-semibold text-amber-500"
                                    title="Repo default write failed - only the local browser copy was saved"
                                >
                                    · default DB NOT overridden
                                </span>
                            )}
                            {lastSavedRepoStatus === 'unavailable' && (
                                <span
                                    className="font-semibold text-muted-foreground"
                                    title="asset-writer server not detected - only the local browser copy was saved"
                                >
                                    · local only
                                </span>
                            )}
                        </span>
                    )}
                    <Button
                        size="icon"
                        variant={overlayEnabled ? "secondary" : "outline"}
                        className={compactIconButtonClass}
                        onClick={() => setOverlayEnabled(!overlayEnabled)}
                        title={overlayEnabled ? "Overlay: on" : "Overlay: off"}
                        aria-pressed={overlayEnabled}
                    >
                        {overlayEnabled ? <Eye /> : <EyeOff />}
                    </Button>
                    {overlayEnabled && (
                        <div className="flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 text-xs">
                            <span className="text-muted-foreground" title="Overlay opacity">α</span>
                            <input className={sliderClass} type="range" min={0} max={1} step={0.05} value={overlayOpacity} onChange={(e) => setOverlayOpacity(Number(e.target.value))} />
                            <span className="tabular-nums">{Math.round(overlayOpacity * 100)}%</span>
                        </div>
                    )}
                    {/* Intentionally no "stretched/uniform" toggle: it was confusing and didn't affect alignment workflow. */}
                    {imageURL && (
                        <div className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground" title="View zoom">🔎</span>
                            <Button size="icon" variant="outline" className={compactIconButtonClass} onClick={() => setZoom(Math.max(0.5, Number((zoom - 0.1).toFixed(2))))} aria-label="Zoom out">
                                <ZoomOut />
                            </Button>
                            <input
                                type="range"
                                min={0.5}
                                max={2}
                                step={0.05}
                                value={zoom}
                                onChange={(e) => setZoom(Number(e.target.value))}
                                className={sliderClass}
                            />
                            <Button size="icon" variant="outline" className={compactIconButtonClass} onClick={() => setZoom(Math.min(2, Number((zoom + 0.1).toFixed(2))))} aria-label="Zoom in">
                                <ZoomIn />
                            </Button>
                            <Button size="icon" variant="outline" className={compactIconButtonClass} onClick={() => setZoom(1)} aria-label="Fit zoom">
                                <Maximize2 />
                            </Button>
                            <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
                        </div>
                    )}
                    {imageURL && overlayEnabled && (
                        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 text-xs" title="Scale only the overlay image (grid stays fixed). Alt+wheel scales uniformly. Alt+Shift stretches X. Alt+Ctrl stretches Y.">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            <Button
                                size="icon"
                                variant={lockImageAspect ? "secondary" : "outline"}
                                className={compactIconButtonClass}
                                onClick={() => {
                                    markUnsaved();
                                    const next = !lockImageAspect;
                                    if (next) {
                                        const avg = Number((((imageScaleX + imageScaleY) / 2)).toFixed(3));
                                        setImageScaleX(avg);
                                        setImageScaleY(avg);
                                    }
                                    setLockImageAspect(next);
                                }}
                                title={lockImageAspect ? "Aspect locked" : "Aspect unlocked"}
                                aria-pressed={lockImageAspect}
                                aria-label={lockImageAspect ? "Lock image scale" : "Unlock image scale"}
                            >
                                {lockImageAspect ? <Link2 /> : <Link2Off />}
                            </Button>

                            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                            <Button
                                size="icon"
                                variant="outline"
                                className={compactIconButtonClass}
                                onClick={() => {
                                    markUnsaved();
                                    const next = Math.max(0.85, Number((imageScaleX - 0.005).toFixed(3)));
                                    setImageScaleX(next);
                                    if (lockImageAspect) setImageScaleY(next);
                                }}
                                aria-label="Decrease image scale X"
                            >
                                <ZoomOut />
                            </Button>
                            <input
                                type="range"
                                min={0.85}
                                max={1.15}
                                step={0.001}
                                value={imageScaleX}
                                onChange={(e) => {
                                    markUnsaved();
                                    const next = Number(e.target.value);
                                    setImageScaleX(next);
                                    if (lockImageAspect) setImageScaleY(next);
                                }}
                                aria-label="Image scale X"
                                className={sliderClass}
                            />
                            <Button
                                size="icon"
                                variant="outline"
                                className={compactIconButtonClass}
                                onClick={() => {
                                    markUnsaved();
                                    const next = Math.min(1.15, Number((imageScaleX + 0.005).toFixed(3)));
                                    setImageScaleX(next);
                                    if (lockImageAspect) setImageScaleY(next);
                                }}
                                aria-label="Increase image scale X"
                            >
                                <ZoomIn />
                            </Button>
                            <span className="tabular-nums">{Math.round(imageScaleX * 1000) / 10}%</span>

                            {!lockImageAspect && (
                                <>
                                    <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
                                    <Button
                                        variant="outline"
                                        className={compactButtonClass}
                                        onClick={autoFitImageScaleY}
                                        title="Auto-fit vertical overlay scale to the detected tile grid"
                                    >
                                        Fit Y
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className={compactIconButtonClass}
                                        onClick={() => {
                                            markUnsaved();
                                            setImageScaleY(Math.max(0.85, Number((imageScaleY - 0.005).toFixed(3))));
                                        }}
                                        aria-label="Decrease image scale Y"
                                    >
                                        <ZoomOut />
                                    </Button>
                                    <input
                                        type="range"
                                        min={0.85}
                                        max={1.15}
                                        step={0.001}
                                        value={imageScaleY}
                                        onChange={(e) => {
                                            markUnsaved();
                                            setImageScaleY(Number(e.target.value));
                                        }}
                                        aria-label="Image scale Y"
                                        className={sliderClass}
                                    />
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className={compactIconButtonClass}
                                        onClick={() => {
                                            markUnsaved();
                                            setImageScaleY(Math.min(1.15, Number((imageScaleY + 0.005).toFixed(3))));
                                        }}
                                        aria-label="Increase image scale Y"
                                    >
                                        <ZoomIn />
                                    </Button>
                                    <span className="tabular-nums">{Math.round(imageScaleY * 1000) / 10}%</span>
                                </>
                            )}

                            <Button
                                size="icon"
                                variant="outline"
                                className={compactIconButtonClass}
                                onClick={() => {
                                    markUnsaved();
                                    setImageScaleX(1);
                                    setImageScaleY(1);
                                }}
                                aria-label="Reset image scale"
                                title="Reset image scale"
                            >
                                1x
                            </Button>

                            <Button
                                size="icon"
                                variant={isDragMode ? "secondary" : "outline"}
                                className={compactIconButtonClass}
                                onClick={() => {
                                    setIsDragMode((prev) => !prev);
                                    setIsDraggingGrid(false);
                                }}
                                title="Drag the grid layer over the image overlay"
                                aria-pressed={isDragMode}
                            >
                                <Move />
                            </Button>
                            <span className="tabular-nums text-muted-foreground" title="Overlay frame offset (px)">({gridOffsetX}, {gridOffsetY})</span>
                            <Button
                                size="icon"
                                variant="outline"
                                className={compactIconButtonClass}
                                onClick={() => {
                                    setGridOffsetX(0);
                                    setGridOffsetY(0);
                                }}
                                aria-label="Reset offset"
                                title="Reset offset"
                            >
                                <Maximize2 />
                            </Button>
                        </div>
                    )}
                </div>

            </div>
        </div>
            <div className="relative flex min-h-0 flex-1 gap-1.5">
                <div className="flex w-[184px] shrink-0 flex-col gap-2 overflow-y-auto rounded-md border border-border/60 bg-background/20 p-1.5">
                    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 p-1.5">
                        <span
                            className="h-8 w-8 shrink-0 rounded-md border-2 shadow-sm"
                            style={{
                                borderColor: selectedTile.color,
                                backgroundColor: selectedTile.color,
                                backgroundImage: selectedTileSprite ? `url(${selectedTileSprite})` : undefined,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                                imageRendering: "pixelated",
                            }}
                        />
                        <div className="min-w-0 truncate text-xs font-semibold leading-tight text-foreground">
                            {selectedTile.name}
                        </div>
                    </div>
                    <Palette activeTile={activeTile} setActiveTile={setActiveTile} />
                </div>

                <div className="relative min-h-0 flex-1">
                    {isDragMode && (
                        <div className="pointer-events-none absolute left-2 top-2 z-40 max-w-[min(560px,calc(100%-1rem))] rounded-md border border-amber-500/30 bg-stone-950/90 px-2 py-1 text-[11px] leading-snug text-amber-100 shadow-lg">
                            Drag anywhere on the grid to fine-tune alignment. Mouse wheel zooms the view; hold Alt to scale only the overlay image. Turn drag mode off to paint or click cells.
                        </div>
                    )}
                    <div
                        ref={containerRef}
                        className="h-full min-h-[220px] overflow-auto rounded-md border border-border/60 bg-background/20 [color-scheme:dark] [scrollbar-gutter:stable_both-edges] sm:min-h-[280px]"
                        style={{ padding: GRID_EDITOR_LAYOUT.viewportPaddingPx }}
                        onWheel={onWheelZoom}
                    >
                    <div className="flex min-h-full min-w-full items-center justify-center">
                        <div
                            className="relative"
                            style={{
                                width: `${contentWidthPx + rulerSizePx}px`,
                                height: `${contentHeightPx + rulerSizePx}px`,
                            }}
                        >
                        <div
                            className="grid"
                            style={{
                                gridTemplateColumns: `${rulerSizePx}px ${contentWidthPx}px`,
                                gridTemplateRows: `${rulerSizePx}px ${contentHeightPx}px`,
                                width: `${rulerSizePx + contentWidthPx}px`,
                                height: `${rulerSizePx + contentHeightPx}px`,
                            }}
                        >
                            {/* Corner ruler label */}
                            <div className="flex items-center justify-center border border-border/40 bg-background/80 backdrop-blur-sm">
                                <div className="text-[10px] leading-tight text-muted-foreground tabular-nums text-center">
                                    {cellWidth.toFixed(1)}×{cellHeight.toFixed(1)}px
                                </div>
                            </div>

                            {/* X ruler (px) */}
                            <div className="border border-border/40 bg-background/80 backdrop-blur-sm overflow-hidden">
                                <svg
                                    width={Math.max(1, Math.round(contentWidthPx))}
                                    height={rulerSizePx}
                                    viewBox={`0 0 ${Math.max(1, contentWidthPx)} ${rulerSizePx}`}
                                    shapeRendering="crispEdges"
                                >
                                    {Array.from({ length: cols + 1 }, (_, i) => {
                                        const x = i * cellWidth;
                                        const major = i % 5 === 0;
                                        const tickTo = major ? 6 : 12;
                                        return (
                                            <g key={`xr-${i}`}>
                                                <line x1={x} y1={rulerSizePx} x2={x} y2={tickTo} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
                                                {major && (
                                                    <text x={x + 2} y={11} fontSize="9" fill="rgba(255,255,255,0.65)">
                                                        {Math.round(x)}px
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    })}
                                </svg>
                            </div>

                            {/* Y ruler (px) */}
                            <div className="border border-border/40 bg-background/80 backdrop-blur-sm overflow-hidden">
                                <svg
                                    width={rulerSizePx}
                                    height={Math.max(1, Math.round(contentHeightPx))}
                                    viewBox={`0 0 ${rulerSizePx} ${Math.max(1, contentHeightPx)}`}
                                    shapeRendering="crispEdges"
                                >
                                    {Array.from({ length: rows + 1 }, (_, i) => {
                                        const y = i * cellHeight;
                                        const major = i % 5 === 0;
                                        const tickTo = major ? 6 : 12;
                                        return (
                                            <g key={`yr-${i}`}>
                                                <line x1={rulerSizePx} y1={y} x2={tickTo} y2={y} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
                                                {major && (
                                                    <text x={2} y={y + 10} fontSize="9" fill="rgba(255,255,255,0.65)">
                                                        {Math.round(y)}px
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    })}
                                </svg>
                            </div>

                            {/* Main image + grid */}
                            <div className="relative">
                                {overlayEnabled && imageURL && (
                                    <img
                                        src={imageURL}
                                        alt="overlay"
                                        className="absolute pointer-events-none"
                                        style={{
                                            left: `${imageLeftPx}px`,
                                            opacity: overlayOpacity,
                                            top: `${imageTopPx}px`,
                                            width: `${scaledDisplayWidth}px`,
                                            height: `${scaledDisplayHeight}px`,
                                            // When aspect is unlocked we intentionally allow distortion to match screenshots.
                                            objectFit: lockImageAspect ? 'contain' : 'fill',
                                            imageRendering: 'pixelated',
                                            zIndex: 15
                                        }}
                                    />
                                )}
                                {overlayEnabled && imageURL && (
                                    <div
                                        className="absolute flex items-center justify-center rounded border border-border/60 bg-background/70 backdrop-blur-sm shadow-sm"
                                        style={{
                                            left: `${imageLeftPx}px`,
                                            top: `${Math.max(0, imageTopPx + scaledDisplayHeight / 2)}px`,
                                            transform: "translate(0, -50%)",
                                            width: 22,
                                            height: 22,
                                            zIndex: 30,
                                            cursor: "ew-resize",
                                            touchAction: "none",
                                        }}
                                        title="Drag to stretch/compress the overlay image horizontally (grid stays fixed)."
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            e.currentTarget.setPointerCapture(e.pointerId);
                                            beginResizeImageX(e.clientX, -1);
                                        }}
                                        onPointerMove={(e) => {
                                            if (!isResizingImageX) return;
                                            e.preventDefault();
                                            moveResizeImageX(e.clientX);
                                        }}
                                        onPointerUp={(e) => {
                                            e.preventDefault();
                                            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                            }
                                            endResizeImageX();
                                        }}
                                        onPointerCancel={(e) => {
                                            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                            }
                                            endResizeImageX();
                                        }}
                                    >
                                        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                )}
                                {overlayEnabled && imageURL && (
                                    <div
                                        className="absolute flex items-center justify-center rounded border border-border/60 bg-background/70 backdrop-blur-sm shadow-sm"
                                        style={{
                                            left: `${Math.max(0, imageRightPx)}px`,
                                            top: `${Math.max(0, imageTopPx + scaledDisplayHeight / 2)}px`,
                                            transform: "translate(-50%, -50%)",
                                            width: 22,
                                            height: 22,
                                            zIndex: 30,
                                            cursor: "ew-resize",
                                            touchAction: "none",
                                        }}
                                        title="Drag to stretch/compress the overlay image horizontally (grid stays fixed)."
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            e.currentTarget.setPointerCapture(e.pointerId);
                                            beginResizeImageX(e.clientX, 1);
                                        }}
                                        onPointerMove={(e) => {
                                            if (!isResizingImageX) return;
                                            e.preventDefault();
                                            moveResizeImageX(e.clientX);
                                        }}
                                        onPointerUp={(e) => {
                                            e.preventDefault();
                                            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                            }
                                            endResizeImageX();
                                        }}
                                        onPointerCancel={(e) => {
                                            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                            }
                                            endResizeImageX();
                                        }}
                                    >
                                        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                )}
                                {overlayEnabled && imageURL && (
                                    <div
                                        className="absolute flex items-center justify-center rounded border border-border/60 bg-background/70 backdrop-blur-sm shadow-sm"
                                        style={{
                                            left: `${Math.max(0, imageLeftPx + scaledDisplayWidth / 2)}px`,
                                            top: `${imageTopPx}px`,
                                            transform: "translate(-50%, 0)",
                                            width: 22,
                                            height: 22,
                                            zIndex: 30,
                                            cursor: "ns-resize",
                                            touchAction: "none",
                                        }}
                                        title="Drag to stretch/compress the overlay image vertically (grid stays fixed)."
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            e.currentTarget.setPointerCapture(e.pointerId);
                                            beginResizeImageY(e.clientY, -1);
                                        }}
                                        onPointerMove={(e) => {
                                            if (!isResizingImageY) return;
                                            e.preventDefault();
                                            moveResizeImageY(e.clientY);
                                        }}
                                        onPointerUp={(e) => {
                                            e.preventDefault();
                                            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                            }
                                            endResizeImageY();
                                        }}
                                        onPointerCancel={(e) => {
                                            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                            }
                                            endResizeImageY();
                                        }}
                                    >
                                        <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                )}
                                {overlayEnabled && imageURL && (
                                    <div
                                        className="absolute flex items-center justify-center rounded border border-border/60 bg-background/70 backdrop-blur-sm shadow-sm"
                                        style={{
                                            left: `${Math.max(0, imageLeftPx + scaledDisplayWidth / 2)}px`,
                                            top: `${Math.max(0, imageBottomPx)}px`,
                                            transform: "translate(-50%, -50%)",
                                            width: 22,
                                            height: 22,
                                            zIndex: 30,
                                            cursor: "ns-resize",
                                            touchAction: "none",
                                        }}
                                        title="Drag to stretch/compress the overlay image vertically (grid stays fixed)."
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            e.currentTarget.setPointerCapture(e.pointerId);
                                            beginResizeImageY(e.clientY, 1);
                                        }}
                                        onPointerMove={(e) => {
                                            if (!isResizingImageY) return;
                                            e.preventDefault();
                                            moveResizeImageY(e.clientY);
                                        }}
                                        onPointerUp={(e) => {
                                            e.preventDefault();
                                            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                            }
                                            endResizeImageY();
                                        }}
                                        onPointerCancel={(e) => {
                                            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                                e.currentTarget.releasePointerCapture(e.pointerId);
                                            }
                                            endResizeImageY();
                                        }}
                                    >
                                        <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                )}
                                <div
                                    className="relative z-10"
                                    style={{
                                        width: `${cols * cellWidth}px`,
                                        transform: `translate(${displayOffsetX}px, ${displayOffsetY}px)`,
                                        transformOrigin: 'top left',
                                    }}
                                >
                                    <table
                                        className="text-xs border-collapse"
                                        style={{ tableLayout: 'fixed', borderSpacing: 0 }}
                                        onMouseUp={endPaint}
                                        onMouseLeave={endPaint}
                                    >
                                        <tbody>
                                            {grid.map((row, r) => (
                                                <tr key={r}>
                                                    {row.map((cell, c) => {
                                                        const diff = compareLevel?.grid?.[r]?.[c] !== undefined && compareLevel.grid[r][c] !== cell;
                                                        const isPlayerStart = playerStart?.x === c && playerStart?.y === r;
                                                        return (
                                                            <td key={`${r}-${c}`} className="relative p-0" style={{ width: `${cellWidth}px`, height: `${cellHeight}px` }}>
                                                                <button
                                                                    className="w-full h-full border relative"
                                                                    style={{
                                                                        background: TILE_TYPES.find(t => t.id === cell)?.color || '#000',
                                                                        width: `${cellWidth}px`,
                                                                        height: `${cellHeight}px`,
                                                                    }}
                                                                    onMouseDown={(e) => { e.preventDefault(); beginPaint(r, c); }}
                                                                    onMouseEnter={() => continuePaint(r, c)}
                                                                    title={isPlayerStart ? `Player Start (${r},${c}) = ${cell} - ${TILE_TYPES.find(t => t.id === cell)?.name}` : `(${r},${c}) = ${cell} - ${TILE_TYPES.find(t => t.id === cell)?.name}`}
                                                                    disabled={isDragMode}
                                                                >
                                                                    {isPlayerStart && (
                                                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                                            <div className="text-white font-bold text-lg drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">👤</div>
                                                                        </div>
                                                                    )}
                                                                </button>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {isDragMode && (
                                        <div
                                            className="absolute inset-0 z-20"
                                            style={{
                                                cursor: isDraggingGrid ? 'grabbing' : 'grab',
                                                touchAction: 'none',
                                            }}
                                            onPointerDown={(e) => {
                                                e.preventDefault();
                                                e.currentTarget.setPointerCapture(e.pointerId);
                                                startGridDrag(e.clientX, e.clientY);
                                            }}
                                            onPointerMove={(e) => {
                                                if (!isDraggingGrid) return;
                                                e.preventDefault();
                                                moveGridDrag(e.clientX, e.clientY);
                                            }}
                                            onPointerUp={(e) => {
                                                e.preventDefault();
                                                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                                    e.currentTarget.releasePointerCapture(e.pointerId);
                                                }
                                                endGridDrag();
                                            }}
                                            onPointerCancel={(e) => {
                                                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                                    e.currentTarget.releasePointerCapture(e.pointerId);
                                                }
                                                endGridDrag();
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
                </div>
            </div>

            {!isSaved && compareLevel?.grid && (
                <div className="mt-3">
                    <div className="text-xs font-medium">Game (current) Level {compareLevel.id}</div>
                </div>
            )}
        </div>
    );
};

export default GridEditorPanel;
