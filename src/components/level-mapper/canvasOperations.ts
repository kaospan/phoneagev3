import { drawGrid } from '@/lib/levelgrid';

/**
 * Canvas drawing operations for the level mapper
 * Handles image loading and grid overlay rendering
 * @author Level Mapper Team
 */

/**
 * Draws the uploaded image and optional grid overlay onto the canvas
 * @param canvas - The canvas element to draw on
 * @param imageURL - URL of the uploaded screenshot image
 * @param showGrid - Whether to draw the grid overlay
 * @param rows - Number of grid rows
 * @param cols - Number of grid columns
 * @param gridOffsetX - Horizontal offset for grid positioning
 * @param gridOffsetY - Vertical offset for grid positioning
 */
export const drawCanvasWithImage = (
    canvas: HTMLCanvasElement,
    imageURL: string,
    showGrid: boolean,
    rows: number,
    cols: number,
    gridOffsetX: number,
    gridOffsetY: number
): void => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = imageURL;
    
    img.onload = () => {
        // Scale image to fit screen (max 900px wide)
        const maxW = Math.min(window.innerWidth - 24, 900);
        const scale = Math.min(1, maxW / img.naturalWidth);
        
        canvas.width = Math.floor(img.naturalWidth * scale);
        canvas.height = Math.floor(img.naturalHeight * scale);
        
        // Draw the image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Draw grid overlay if enabled
        if (showGrid) {
            ctx.save();
            ctx.translate(gridOffsetX, gridOffsetY);
            drawGrid(ctx, canvas.width, canvas.height, rows, cols, gridOffsetX, gridOffsetY);
            ctx.restore();
        }
    };
};
