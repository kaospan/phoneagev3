import { useEffect, useRef, RefObject } from 'react';
import { formatGridRowsOneLine } from '@/lib/levelgrid';
import { drawCanvasWithImage } from './canvasOperations';

/**
 * Custom hooks for level mapper side effects
 * Consolidates useEffect logic for better organization
 * @author Level Mapper Team
 */

/**
 * Syncs JSON preview text with grid changes
 * @param grid - The current grid state
 * @param setJsonInput - Setter for JSON input state
 */
export const useJsonSync = (
    grid: number[][],
    jsonInput: string,
    setJsonInput: (json: string) => void
): void => {
    const previousSyncedJsonRef = useRef('');
    useEffect(() => {
        const nextJson = formatGridRowsOneLine(grid);
        if (!jsonInput.trim() || jsonInput === previousSyncedJsonRef.current) {
            setJsonInput(nextJson);
        }
        previousSyncedJsonRef.current = nextJson;
    }, [grid, jsonInput, setJsonInput]);
};

/**
 * Warns user before leaving page with unsaved changes
 * @param isSaved - Whether changes are saved
 */
export const useBeforeUnload = (isSaved: boolean): void => {
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!isSaved) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isSaved]);
};

/**
 * Auto-hides unsaved banner after 4 seconds
 * @param isSaved - Whether changes are saved
 * @param setShowUnsavedBanner - Setter for banner visibility
 */
export const useUnsavedBanner = (
    isSaved: boolean,
    setShowUnsavedBanner: (show: boolean) => void
): void => {
    useEffect(() => {
        if (!isSaved) {
            setShowUnsavedBanner(true);
            const timer = setTimeout(() => setShowUnsavedBanner(false), 4000);
            return () => clearTimeout(timer);
        } else {
            setShowUnsavedBanner(true);
        }
    }, [isSaved, setShowUnsavedBanner]);
};

/**
 * Redraws canvas when image or grid settings change
 * @param canvasRef - Reference to the canvas element
 * @param imageURL - URL of the uploaded image
 * @param showGrid - Whether to show grid overlay
 * @param rows - Number of grid rows
 * @param cols - Number of grid columns
 * @param gridOffsetX - Horizontal grid offset
 * @param gridOffsetY - Vertical grid offset
 */
export const useCanvasDraw = (
    canvasRef: RefObject<HTMLCanvasElement>,
    imageURL: string | null,
    showGrid: boolean,
    rows: number,
    cols: number,
    gridOffsetX: number,
    gridOffsetY: number
): void => {
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imageURL) return;

        drawCanvasWithImage(canvas, imageURL, showGrid, rows, cols, gridOffsetX, gridOffsetY);
    }, [canvasRef, imageURL, showGrid, rows, cols, gridOffsetX, gridOffsetY]);
};

/**
 * Saves level index preferences to localStorage
 * @param compareLevelIndex - Index of comparison level
 * @param saveFunction - Function to save the index
 */
export const useSaveCompareLevel = (
    compareLevelIndex: number,
    saveFunction: (index: number) => void
): void => {
    useEffect(() => {
        saveFunction(compareLevelIndex);
    }, [compareLevelIndex, saveFunction]);
};

/**
 * Saves import level index preference to localStorage
 * @param importLevelIndex - Index of imported level
 * @param saveFunction - Function to save the index
 */
export const useSaveImportLevel = (
    importLevelIndex: number | null,
    saveFunction: (index: number) => void
): void => {
    useEffect(() => {
        if (importLevelIndex !== null) {
            saveFunction(importLevelIndex);
        }
    }, [importLevelIndex, saveFunction]);
};
