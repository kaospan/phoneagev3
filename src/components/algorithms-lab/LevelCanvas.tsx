import React, { useEffect, useRef } from "react";
import type { Position } from "@/game/types";
import type { CellStatus } from "./useSearchRunner";

/**
 * A standalone, read-only top-down grid renderer for the Algorithms Lab. Deliberately not
 * imported from src/components/level-mapper/LevelThumbnail.tsx (which is the same idea, minus
 * search overlays) — the Lab is meant to stay isolated from the Mapper's folder/architecture,
 * and this component is small enough that recreating the same flat-color-key technique here is
 * cheaper than introducing a dependency on Mapper's component tree.
 */
const CELL_COLORS: Record<number, string> = {
  0: "#c9995f", // floor
  1: "#4a3626", // wall/fire
  2: "#3a2f28", // stone
  3: "#22c55e", // cave (goal)
  4: "#1d4ed8", // water
  5: "#0b0a09", // void
  6: "#8a6238", // breakable rock
  14: "#dc2626", // red key
  15: "#16a34a", // green key
  16: "#7f1d1d", // red lock
  17: "#14532d", // green lock
  18: "#a16207", // start cave marker
  19: "#7e22ce", // teleport
  20: "#f59e0b", // bonus time
};
const ARROW_BG = "#8a6a30";
const ARROW_DOT = "#f6c84f";

const OVERLAY_COLORS: Record<CellStatus, string> = {
  visited: "rgba(59, 130, 246, 0.45)", // blue
  frontier: "rgba(250, 204, 21, 0.45)", // amber
};

export interface LevelCanvasProps {
  grid: number[][];
  cavePos?: Position | null;
  playerStart?: Position | null;
  width?: number;
  height?: number;
  /** Cell key "x,y" -> visited/frontier, from useSearchRunner. */
  overlay?: Map<string, CellStatus> | null;
  /** The state currently being expanded, highlighted with a bright ring. */
  currentPos?: Position | null;
  /** Once solved, the player's path through the grid, drawn as a line. */
  solutionPath?: Position[] | null;
  className?: string;
}

export const LevelCanvas: React.FC<LevelCanvasProps> = ({
  grid,
  cavePos,
  playerStart,
  width = 280,
  height = 176,
  overlay,
  currentPos,
  solutionPath,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0a09";
    ctx.fillRect(0, 0, width, height);
    if (rows === 0 || cols === 0) return;

    const cw = width / cols;
    const ch = height / rows;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const cell = grid[y][x];
        const isArrow = cell >= 7 && cell <= 13;
        ctx.fillStyle = isArrow ? ARROW_BG : CELL_COLORS[cell] ?? "#0b0a09";
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

    if (overlay && overlay.size > 0) {
      for (const [key, status] of overlay) {
        const [xs, ys] = key.split(",");
        const x = Number(xs);
        const y = Number(ys);
        if (!Number.isFinite(x) || !Number.isFinite(y) || y >= rows || x >= cols) continue;
        ctx.fillStyle = OVERLAY_COLORS[status];
        ctx.fillRect(x * cw, y * ch, Math.ceil(cw) + 0.5, Math.ceil(ch) + 0.5);
      }
    }

    if (cavePos && cavePos.y < rows && cavePos.x < cols) {
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = Math.max(1, Math.min(cw, ch) * 0.12);
      ctx.strokeRect(
        cavePos.x * cw + ctx.lineWidth / 2,
        cavePos.y * ch + ctx.lineWidth / 2,
        cw - ctx.lineWidth,
        ch - ctx.lineWidth,
      );
    }

    if (solutionPath && solutionPath.length > 1) {
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = Math.max(1.5, Math.min(cw, ch) * 0.14);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      solutionPath.forEach((pos, i) => {
        const px = pos.x * cw + cw / 2;
        const py = pos.y * ch + ch / 2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    } else if (playerStart && playerStart.y < rows && playerStart.x < cols) {
      ctx.beginPath();
      ctx.fillStyle = "#fef08a";
      ctx.strokeStyle = "#78350f";
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

    if (currentPos && currentPos.y < rows && currentPos.x < cols) {
      ctx.beginPath();
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = Math.max(1.5, Math.min(cw, ch) * 0.16);
      ctx.arc(
        currentPos.x * cw + cw / 2,
        currentPos.y * ch + ch / 2,
        Math.max(2, Math.min(cw, ch) * 0.38),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }, [grid, cavePos, playerStart, width, height, overlay, currentPos, solutionPath]);

  return (
    <canvas
      ref={canvasRef}
      // CSS size is intentionally decoupled from the width/height props above (those still set
      // the drawing-buffer resolution). width:100% + maxWidth lets the box shrink to fit a narrow
      // phone viewport instead of forcing a fixed pixel width that could overflow it; minWidth:0
      // overrides the browser's default "don't shrink a replaced element below its intrinsic
      // size" behavior, which otherwise re-applies here since devicePixelRatio scaling can make
      // the canvas's actual drawing-buffer size (the intrinsic size) 2-3x larger than width/height.
      style={{
        width: "100%",
        maxWidth: width,
        height: "auto",
        aspectRatio: `${width} / ${height}`,
        minWidth: 0,
        display: "block",
      }}
      className={className}
      role="img"
      aria-label="Level grid"
    />
  );
};

export default LevelCanvas;
