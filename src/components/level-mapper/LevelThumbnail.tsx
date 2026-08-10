import React, { useEffect, useRef } from 'react';

// Flat top-down color key — intentionally abstract/fast rather than full game art, so hundreds
// of these can render at once in the solutions list. See LevelSolutionsBrowser for the full-art
// GameTop2D preview used for the single selected level.
const CELL_COLORS: Record<number, string> = {
  0: '#c9995f', // floor
  1: '#4a3626', // wall/fire
  2: '#3a2f28', // stone
  3: '#22c55e', // cave (goal)
  4: '#1d4ed8', // water
  5: '#0b0a09', // void
  6: '#8a6238', // breakable rock
  14: '#dc2626', // red key
  15: '#16a34a', // green key
  16: '#7f1d1d', // red lock
  17: '#14532d', // green lock
  18: '#a16207', // start cave marker
  19: '#7e22ce', // teleport
  20: '#f59e0b', // bonus time
};
const ARROW_BG = '#8a6a30';
const ARROW_DOT = '#f6c84f';

export const LevelThumbnail: React.FC<{
  grid: number[][];
  cavePos?: { x: number; y: number } | null;
  playerStart?: { x: number; y: number } | null;
  width?: number;
  height?: number;
  className?: string;
}> = ({ grid, cavePos, playerStart, width = 120, height = 76, className }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0a09';
    ctx.fillRect(0, 0, width, height);
    if (rows === 0 || cols === 0) return;

    const cw = width / cols;
    const ch = height / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = grid[y][x];
        const isArrow = cell >= 7 && cell <= 13;
        ctx.fillStyle = isArrow ? ARROW_BG : CELL_COLORS[cell] ?? '#0b0a09';
        ctx.fillRect(x * cw, y * ch, Math.ceil(cw) + 0.5, Math.ceil(ch) + 0.5);
        if (isArrow) {
          ctx.fillStyle = ARROW_DOT;
          const r = Math.max(0.6, Math.min(cw, ch) * 0.22);
          ctx.beginPath();
          ctx.arc(x * cw + cw / 2, y * ch + ch / 2, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (cavePos && cavePos.y < rows && cavePos.x < cols) {
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(cavePos.x * cw, cavePos.y * ch, Math.ceil(cw) + 0.5, Math.ceil(ch) + 0.5);
    }

    if (playerStart && playerStart.y < rows && playerStart.x < cols) {
      ctx.beginPath();
      ctx.fillStyle = '#fef08a';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1;
      ctx.arc(
        playerStart.x * cw + cw / 2,
        playerStart.y * ch + ch / 2,
        Math.max(1.2, Math.min(cw, ch) * 0.3),
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.stroke();
    }
  }, [grid, cavePos, playerStart, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: 'block' }}
      className={className}
      aria-hidden
    />
  );
};

export default LevelThumbnail;
