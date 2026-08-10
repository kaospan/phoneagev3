// Shared utilities and constants for the Level Mapper

export type TileType = { id: number; name: string; color: string };

export const TILE_TYPES: TileType[] = [
  { id: 0, name: "Floor (0)", color: "#c9a876" },
  { id: 1, name: "Fire/Wall (1)", color: "#a67c52" },
  { id: 2, name: "Stone (2)", color: "#6b4423" },
  { id: 3, name: "Cave (3)", color: "#6ab82e" },
  { id: 4, name: "Water (4)", color: "#1e90ff" },
  { id: 5, name: "Void (5)", color: "#ffffff" },
  { id: 6, name: "Breakable (6)", color: "#4a9eff" },
  { id: 7, name: "Arrow Up (7)", color: "#1976d2" },
  { id: 8, name: "Arrow Right (8)", color: "#43a047" },
  { id: 9, name: "Arrow Down (9)", color: "#fbc02d" },
  { id: 10, name: "Arrow Left (10)", color: "#d32f2f" },
  { id: 11, name: "Arrow Up/Down (11)", color: "#7b1fa2" },
  { id: 12, name: "Arrow Left/Right (12)", color: "#00838f" },
  { id: 13, name: "Arrow Omni (13)", color: "#ff9800" },
  { id: 14, name: "Red Key (14)", color: "#e53935" },
  { id: 15, name: "Green Key (15)", color: "#43a047" },
  { id: 16, name: "Red Lock (16)", color: "#b71c1c" },
  { id: 17, name: "Green Lock (17)", color: "#1b5e20" },
  { id: 18, name: "Start Cave (18)", color: "#111111" },
  { id: 19, name: "Teleport (19)", color: "#7dd3fc" },
  { id: 20, name: "Bonus Time (20)", color: "#fbbf24" },
];

export const emptyGrid = (rows: number, cols: number): number[][] =>
  Array.from({ length: rows }, () => Array(cols).fill(0));

export const voidGrid = (rows: number, cols: number): number[][] =>
  Array.from({ length: rows }, () => Array(cols).fill(5));

export const formatGridRowsOneLine = (g: number[][]) => {
  const lines = g.map(row => `[${row.join(", ")}]`);
  return `[
 ${lines.join(",\n ")}
]`;
};

export const drawGrid = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: number,
  c: number,
  offsetX: number,
  offsetY: number
) => {
  // Grab image pixels once for sampling
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const isDark = (ri: number, gi: number, bi: number, thr = 40) => ri < thr && gi < thr && bi < thr;

  const sampleHorizontalDarkRatio = (yCanvas: number) => {
    const y = Math.max(0, Math.min(h - 1, Math.round(yCanvas)));
    let dark = 0;
    let total = 0;
    for (let x = 0; x < w; x += 2) {
      const idx = (y * w + x) * 4;
      const rC = data[idx], gC = data[idx + 1], bC = data[idx + 2];
      if (isDark(rC, gC, bC)) dark++;
      total++;
    }
    return total ? dark / total : 0;
  };

  const sampleVerticalDarkRatio = (xCanvas: number) => {
    const x = Math.max(0, Math.min(w - 1, Math.round(xCanvas)));
    let dark = 0;
    let total = 0;
    for (let y = 0; y < h; y += 2) {
      const idx = (y * w + x) * 4;
      const rC = data[idx], gC = data[idx + 1], bC = data[idx + 2];
      if (isDark(rC, gC, bC)) dark++;
      total++;
    }
    return total ? dark / total : 0;
  };

  // Draw lines, coloring in green when a dark (black) line is detected at expected positions
  ctx.save();
  ctx.lineWidth = 1;

  // Horizontal grid lines (between rows)
  for (let yIdx = 0; yIdx <= r; yIdx++) {
    const py = Math.round((yIdx * h) / r) + 0.5; // drawing position in translated space
    const sampleY = (yIdx * h) / r + offsetY; // sampling position in canvas space
    const ratio = sampleHorizontalDarkRatio(sampleY);
    ctx.strokeStyle = ratio > 0.35 ? "rgba(16,185,129,0.95)" : "rgba(255,255,255,0.5)"; // green if matches
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
    ctx.stroke();
  }

  // Vertical grid lines (between cols)
  for (let xIdx = 0; xIdx <= c; xIdx++) {
    const px = Math.round((xIdx * w) / c) + 0.5; // drawing position in translated space
    const sampleX = (xIdx * w) / c + offsetX; // sampling position in canvas space
    const ratio = sampleVerticalDarkRatio(sampleX);
    ctx.strokeStyle = ratio > 0.35 ? "rgba(16,185,129,0.95)" : "rgba(255,255,255,0.5)"; // green if matches
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }

  ctx.restore();
};
