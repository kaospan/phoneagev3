export type HourglassIconOptions = {
  /**
   * Triangle fill for the upper half.
   * Default chosen to match Tailwind amber-400.
   */
  topFill?: string;
  /**
   * Triangle fill for the lower half.
   * Default chosen to match Tailwind amber-500.
   */
  bottomFill?: string;
  /**
   * Outline stroke for both triangles.
   */
  stroke?: string;
  /**
   * Soft glow behind the icon (set to empty/transparent to disable).
   */
  glow?: string;
};

function getHourglassDefaults(opts?: HourglassIconOptions): Required<HourglassIconOptions> {
  return {
    topFill: opts?.topFill ?? "rgba(251,191,36,0.98)",
    bottomFill: opts?.bottomFill ?? "rgba(245,158,11,0.98)",
    stroke: opts?.stroke ?? "rgba(120,53,15,0.85)",
    glow: opts?.glow ?? "rgba(251,191,36,0.22)",
  };
}

/**
 * Draw a single animation frame for a top-down hourglass icon.
 * - `progress` is 0..1 where 0 = top full, 1 = bottom full.
 * - `streamPhase` is 0..1 used to animate a small falling-sand stream.
 */
export function drawHourglassTopDownFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  progress: number,
  streamPhase: number,
  opts?: HourglassIconOptions
) {
  const { topFill, bottomFill, stroke, glow } = getHourglassDefaults(opts);

  const p = Math.max(0, Math.min(1, progress));
  const phase = ((streamPhase % 1) + 1) % 1;

  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.46;

  // Subtle glow so the icon reads on varied backgrounds.
  if (glow && glow !== "transparent" && glow !== "rgba(0,0,0,0)" && glow !== "rgba(0,0,0,0.0)") {
    const grad = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
    grad.addColorStop(0, glow);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const w = size * 0.25;
  const h = size * 0.30;
  const pad = size * 0.06;

  const topBaseY = cy - (h + pad);
  const botBaseY = cy + (h + pad);

  // Chamber outlines (glass).
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, Math.round(size * 0.04));
  ctx.lineJoin = "round";
  ctx.globalAlpha = 1;
  // Top chamber.
  ctx.beginPath();
  ctx.moveTo(cx - w, topBaseY);
  ctx.lineTo(cx + w, topBaseY);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.stroke();
  // Bottom chamber.
  ctx.beginPath();
  ctx.moveTo(cx - w, botBaseY);
  ctx.lineTo(cx + w, botBaseY);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.stroke();

  // Top sand (shrinks away from the tip as it drains).
  const topFull = 1 - p;
  if (topFull > 0.04) {
    const tipY = cy - (1 - topFull) * h;
    ctx.fillStyle = topFill;
    ctx.beginPath();
    ctx.moveTo(cx - w, topBaseY);
    ctx.lineTo(cx + w, topBaseY);
    ctx.lineTo(cx, tipY);
    ctx.closePath();
    ctx.fill();
  }

  // Bottom sand (grows down from the tip as it fills).
  const botFull = p;
  if (botFull > 0.04) {
    const fillBaseY = cy + pad + botFull * h;
    ctx.fillStyle = bottomFill;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - w, fillBaseY);
    ctx.lineTo(cx + w, fillBaseY);
    ctx.closePath();
    ctx.fill();
  }

  // Falling sand stream (only while sand is actively moving).
  if (p < 0.985) {
    const streamY0 = cy - pad * 0.35;
    const streamY1 = cy + pad * 0.55;
    const dots = 3;
    for (let i = 0; i < dots; i += 1) {
      const t = (phase + i / dots) % 1;
      const y = streamY0 + (streamY1 - streamY0) * t;
      const a = 0.55 * (1 - Math.abs(0.5 - t) * 1.8);
      ctx.fillStyle = `rgba(255,247,210,${Math.max(0.12, a)})`;
      ctx.beginPath();
      ctx.arc(cx, y, Math.max(1.2, size * 0.028), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Small highlight pin at the meeting point.
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1.2, size * 0.03), 0, Math.PI * 2);
  ctx.fill();
}

export function drawHourglassTopDown(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: HourglassIconOptions
) {
  // Static icon defaults to mid-flow so it reads as an hourglass (not a filled diamond).
  drawHourglassTopDownFrame(ctx, size, 0.5, 0.25, opts);
}

export function createHourglassIconCanvas(size: number, opts?: HourglassIconOptions): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawHourglassTopDown(ctx, size, opts);
  return canvas;
}

export function createHourglassIconDataUrl(size: number, opts?: HourglassIconOptions): string | null {
  const canvas = createHourglassIconCanvas(size, opts);
  return canvas ? canvas.toDataURL("image/png") : null;
}

export type BreakableRockTileOptions = {
  /** Base tile fill (mid tone). */
  base?: string;
  /** Light bevel / highlight. */
  highlight?: string;
  /** Dark bevel / shadow. */
  shadow?: string;
  /** Crack core color. */
  crack?: string;
  /** Crack rim highlight color (subtle). */
  crackRim?: string;
};

function getBreakableRockDefaults(opts?: BreakableRockTileOptions): Required<BreakableRockTileOptions> {
  return {
    // Defaults chosen to resemble the original DOS "breakable rock" tile (brown stone with cracks).
    base: opts?.base ?? "rgba(178, 124, 72, 1)",
    highlight: opts?.highlight ?? "rgba(232, 183, 108, 1)",
    shadow: opts?.shadow ?? "rgba(88, 52, 30, 1)",
    crack: opts?.crack ?? "rgba(26, 14, 8, 1)",
    crackRim: opts?.crackRim ?? "rgba(255, 240, 210, 0.35)",
  };
}

/**
 * Draw a pixel-art-ish top-down breakable rock tile.
 * Deterministic (no Math.random) so builds are stable.
 */
export function drawBreakableRockTile(ctx: CanvasRenderingContext2D, size: number, opts?: BreakableRockTileOptions) {
  const { base, highlight, shadow, crack, crackRim } = getBreakableRockDefaults(opts);

  ctx.clearRect(0, 0, size, size);
  const u = size / 64;
  const px = (v: number) => v * u;

  // Deep mortar/gaps behind the individual rock chunks.
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, size, size);

  // Warm underpaint so tiny gaps still read like stone instead of empty black.
  const diag = ctx.createLinearGradient(0, 0, size, size);
  diag.addColorStop(0, "rgba(255,255,255,0.08)");
  diag.addColorStop(0.55, "rgba(0,0,0,0.02)");
  diag.addColorStop(1, "rgba(0,0,0,0.24)");
  ctx.fillStyle = diag;
  ctx.fillRect(0, 0, size, size);

  const rockShapes: Array<Array<[number, number]>> = [
    [[4, 5], [18, 5], [23, 12], [18, 24], [5, 22]],
    [[20, 4], [39, 5], [39, 19], [24, 20], [21, 13]],
    [[41, 6], [59, 5], [60, 21], [47, 24], [39, 17]],
    [[4, 24], [21, 24], [25, 38], [13, 43], [4, 36]],
    [[25, 22], [43, 22], [46, 39], [31, 45], [23, 35]],
    [[47, 25], [60, 23], [59, 43], [48, 46], [43, 38]],
    [[5, 44], [23, 43], [22, 59], [4, 58]],
    [[25, 45], [43, 43], [42, 59], [23, 60]],
    [[45, 47], [60, 44], [59, 59], [44, 60]],
  ];

  const drawPoly = (points: Array<[number, number]>, index: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(px(points[0][0]), px(points[0][1]));
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(px(points[i][0]), px(points[i][1]));
    ctx.closePath();
    ctx.fillStyle = base;
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.strokeStyle = shadow;
    ctx.lineWidth = Math.max(2, px(3.2));
    ctx.stroke();

    ctx.clip();
    const shade = ctx.createLinearGradient(0, 0, size, size);
    shade.addColorStop(0, "rgba(255,255,255,0.16)");
    shade.addColorStop(0.5, "rgba(255,255,255,0.02)");
    shade.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = "rgba(255,244,210,0.36)";
    ctx.lineWidth = Math.max(1, px(1.25));
    ctx.beginPath();
    ctx.moveTo(px(points[0][0] + 2), px(points[0][1] + 2));
    const hi = points[Math.min(2, points.length - 1)];
    ctx.lineTo(px(hi[0] - 2), px(hi[1] + 1));
    ctx.stroke();

    ctx.fillStyle = index % 3 === 0 ? "rgba(255,235,190,0.16)" : "rgba(0,0,0,0.10)";
    ctx.fillRect(px(points[0][0] + 3), px(points[0][1] + 4), Math.max(1, px(5)), Math.max(1, px(2)));
    ctx.restore();
  };

  rockShapes.forEach(drawPoly);

  const strokeCrack = (pts: Array<[number, number]>) => {
    ctx.strokeStyle = crack;
    ctx.lineWidth = Math.max(1, px(1.8));
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.beginPath();
    ctx.moveTo(px(pts[0][0]), px(pts[0][1]));
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(px(pts[i][0]), px(pts[i][1]));
    ctx.stroke();

    ctx.strokeStyle = crackRim;
    ctx.lineWidth = Math.max(1, px(0.9));
    ctx.beginPath();
    ctx.moveTo(px(pts[0][0] - 0.9), px(pts[0][1] - 0.9));
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(px(pts[i][0] - 0.9), px(pts[i][1] - 0.9));
    ctx.stroke();
  };

  strokeCrack([[8, 8], [14, 13], [16, 21]]);
  strokeCrack([[26, 8], [31, 15], [37, 18]]);
  strokeCrack([[48, 9], [52, 15], [57, 18]]);
  strokeCrack([[9, 28], [16, 33], [21, 39]]);
  strokeCrack([[30, 26], [36, 32], [43, 36]]);
  strokeCrack([[53, 28], [50, 35], [55, 42]]);
  strokeCrack([[9, 49], [15, 55], [20, 58]]);
  strokeCrack([[30, 49], [35, 54], [39, 58]]);
  strokeCrack([[49, 50], [54, 55], [58, 57]]);

  // Chunky outside border keeps the tile readable against floor/water.
  ctx.strokeStyle = shadow;
  ctx.lineWidth = Math.max(2, px(3));
  ctx.strokeRect(px(2), px(2), size - px(4), size - px(4));
}

export function createBreakableRockTileCanvas(size: number, opts?: BreakableRockTileOptions): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Keep pixels crisp even if callers scale this canvas into a texture.
  ctx.imageSmoothingEnabled = false;
  drawBreakableRockTile(ctx, size, opts);
  return canvas;
}

export function createBreakableRockTileDataUrl(size: number, opts?: BreakableRockTileOptions): string | null {
  const canvas = createBreakableRockTileCanvas(size, opts);
  return canvas ? canvas.toDataURL("image/png") : null;
}

export type VortexIconOptions = {
  /** Bright inner swirl color. */
  inner?: string;
  /** Mid swirl color. */
  mid?: string;
  /** Outer splash color. */
  outer?: string;
  /** Dark core color. */
  core?: string;
  /** Outline stroke. */
  outline?: string;
  /** Soft glow behind the icon. */
  glow?: string;
};

function getVortexDefaults(opts?: VortexIconOptions): Required<VortexIconOptions> {
  return {
    inner: opts?.inner ?? "rgba(52,211,153,0.98)", // emerald-400
    mid: opts?.mid ?? "rgba(34,197,94,0.92)", // green-500
    outer: opts?.outer ?? "rgba(16,185,129,0.70)", // emerald-500
    core: opts?.core ?? "rgba(2,6,23,0.92)", // slate-950
    outline: opts?.outline ?? "rgba(15,23,42,0.55)", // slate-900
    glow: opts?.glow ?? "rgba(16,185,129,0.18)",
  };
}

/**
 * Draw a top-down "liquid vortex" icon.
 * Intentionally deterministic (no randomness) so builds are stable across runs.
 */
export function drawVortexTopDownFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: VortexIconOptions
) {
  const { inner, mid, outer, core, outline, glow } = getVortexDefaults(opts);

  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.46;

  // Glow behind.
  if (glow && glow !== "transparent" && glow !== "rgba(0,0,0,0)" && glow !== "rgba(0,0,0,0.0)") {
    const grad = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r * 1.25);
    grad.addColorStop(0, glow);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Outer splash silhouette (slightly irregular circle).
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  const bumpsA = 11;
  const bumpsB = 7;
  for (let i = 0; i <= 240; i += 1) {
    const t = i / 240;
    const ang = t * Math.PI * 2;
    const bump = 1 + 0.06 * Math.sin(ang * bumpsA) + 0.03 * Math.sin(ang * bumpsB + 1.4);
    const rr = r * 0.98 * bump;
    const x = Math.cos(ang) * rr;
    const y = Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const splashGrad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.02);
  splashGrad.addColorStop(0, "rgba(0,0,0,0)");
  splashGrad.addColorStop(0.45, outer);
  splashGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = splashGrad;
  ctx.fill();
  ctx.restore();

  // Main vortex disc: green liquid fading into a dark core.
  const discGrad = ctx.createRadialGradient(cx, cy, r * 0.06, cx, cy, r);
  discGrad.addColorStop(0, core);
  discGrad.addColorStop(0.22, "rgba(2,6,23,0.82)");
  discGrad.addColorStop(0.44, inner);
  discGrad.addColorStop(0.72, mid);
  discGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = discGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Spiral strokes (liquid swirl).
  ctx.save();
  ctx.translate(cx, cy);
  const arms = 4;
  const turns = 3.8;
  for (let a = 0; a < arms; a += 1) {
    const phase = (a * Math.PI * 2) / arms + 0.25;
    ctx.beginPath();
    for (let i = 0; i <= 260; i += 1) {
      const t = i / 260;
      const rr = t * r * 0.9;
      const ang = t * Math.PI * 2 * turns + phase + t * 0.6;
      const x = Math.cos(ang) * rr;
      const y = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1, Math.round(size * 0.03));
    ctx.lineCap = "round";
    ctx.stroke();
  }
  // Inner swirl accent.
  ctx.beginPath();
  for (let i = 0; i <= 220; i += 1) {
    const t = i / 220;
    const rr = t * r * 0.55;
    const ang = t * Math.PI * 2 * 5.2 + 0.9;
    const x = Math.cos(ang) * rr;
    const y = Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "rgba(16,185,129,0.55)";
  ctx.lineWidth = Math.max(1, Math.round(size * 0.035));
  ctx.stroke();
  ctx.restore();

  // Rim highlight (not a full ring, avoids "target" look).
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, -Math.PI * 0.15, Math.PI * 0.35);
  ctx.stroke();

  // Dark core (hole) with soft edge (avoid "target" look).
  const coreGrad = ctx.createRadialGradient(cx, cy, r * 0.02, cx, cy, r * 0.22);
  coreGrad.addColorStop(0, core);
  coreGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
  ctx.fill();

  // Outline accents: a couple of arcs instead of a full ring.
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.98, Math.PI * 0.12, Math.PI * 0.48);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.98, Math.PI * 1.08, Math.PI * 1.28);
  ctx.stroke();
}

export function drawVortexTopDown(ctx: CanvasRenderingContext2D, size: number, opts?: VortexIconOptions) {
  drawVortexTopDownFrame(ctx, size, opts);
}

export function createVortexIconCanvas(size: number, opts?: VortexIconOptions): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawVortexTopDown(ctx, size, opts);
  return canvas;
}

export function createVortexIconDataUrl(size: number, opts?: VortexIconOptions): string | null {
  const canvas = createVortexIconCanvas(size, opts);
  return canvas ? canvas.toDataURL("image/png") : null;
}

export type KeyIconOptions = {
  /** Accent color to distinguish red vs green keys. */
  accent?: string;
  /** Soft glow behind the key. */
  glow?: string;
  /** Outline stroke. */
  outline?: string;
  /** Metal highlight. */
  metalLight?: string;
  /** Metal shadow. */
  metalDark?: string;
};

const parseRgba = (input: string): { r: number; g: number; b: number; a: number } => {
  const m = input.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!m) return { r: 200, g: 200, b: 200, a: 1 };
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] !== undefined ? Number(m[4]) : 1 };
};

const lighten = (rgba: string, amount: number): string => {
  const { r, g, b, a } = parseRgba(rgba);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgba(${mix(r)},${mix(g)},${mix(b)},${a})`;
};

const darken = (rgba: string, amount: number): string => {
  const { r, g, b, a } = parseRgba(rgba);
  const mix = (c: number) => Math.round(c * (1 - amount));
  return `rgba(${mix(r)},${mix(g)},${mix(b)},${a})`;
};

function getKeyDefaults(opts?: KeyIconOptions): Required<KeyIconOptions> {
  const accent = opts?.accent ?? "rgba(239,68,68,0.98)"; // red-500
  return {
    accent,
    glow: opts?.glow ?? "rgba(239,68,68,0.18)",
    outline: opts?.outline ?? "rgba(15,23,42,0.55)",
    // Derived from accent (rather than a fixed gold) so red vs green keys read as
    // clearly different-colored metal, not just "gold key with a tiny colored dot".
    metalLight: opts?.metalLight ?? lighten(accent, 0.55),
    metalDark: opts?.metalDark ?? darken(accent, 0.35),
  };
}

const pathRoundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
};

/**
 * Draw a simple, readable top-down key icon (ring head + shaft + teeth).
 * Designed to remain recognizable even when the camera is high/top-down.
 */
export function drawKeyTopDown(ctx: CanvasRenderingContext2D, size: number, opts?: KeyIconOptions) {
  const { accent, glow, outline, metalLight, metalDark } = getKeyDefaults(opts);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.46;

  // Glow for contrast on bright tiles.
  if (glow && glow !== "transparent" && glow !== "rgba(0,0,0,0)" && glow !== "rgba(0,0,0,0.0)") {
    const grad = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r * 1.2);
    grad.addColorStop(0, glow);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
    ctx.fill();
  }

  const metalGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  metalGrad.addColorStop(0, metalLight);
  metalGrad.addColorStop(0.6, accent);
  metalGrad.addColorStop(1, metalDark);

  ctx.strokeStyle = outline;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, size * 0.05);

  // Ring head.
  const headCx = cx - r * 0.18;
  const headCy = cy - r * 0.05;
  const headR = r * 0.23;
  ctx.fillStyle = metalGrad;
  ctx.beginPath();
  ctx.arc(headCx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Punch hole (transparent).
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(headCx, headCy, headR * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Shaft (rounded rectangle).
  const shaftX = headCx + headR * 0.25;
  const shaftY = headCy - headR * 0.32;
  const shaftW = r * 0.92;
  const shaftH = headR * 0.64;
  ctx.fillStyle = metalGrad;
  pathRoundRect(ctx, shaftX, shaftY, shaftW, shaftH, shaftH * 0.35);
  ctx.fill();
  ctx.stroke();

  // Teeth.
  const toothBaseX = shaftX + shaftW * 0.68;
  const toothY = shaftY + shaftH * 0.52;
  const toothW = shaftW * 0.12;
  const toothH = shaftH * 0.55;
  for (let i = 0; i < 2; i += 1) {
    const x = toothBaseX + i * toothW * 1.05;
    const h = toothH * (i === 0 ? 1.0 : 0.75);
    ctx.fillStyle = metalGrad;
    pathRoundRect(ctx, x, toothY, toothW, h, shaftH * 0.18);
    ctx.fill();
    ctx.stroke();
  }

  // Accent gem/dot to show key color clearly.
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(headCx + headR * 0.55, headCy - headR * 0.15, headR * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // Tiny highlight.
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.arc(headCx - headR * 0.15, headCy - headR * 0.12, headR * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

export function createKeyIconCanvas(size: number, opts?: KeyIconOptions): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawKeyTopDown(ctx, size, opts);
  return canvas;
}

export function createKeyIconDataUrl(size: number, opts?: KeyIconOptions): string | null {
  const canvas = createKeyIconCanvas(size, opts);
  return canvas ? canvas.toDataURL("image/png") : null;
}

export type LockIconOptions = {
  /** Body fill color */
  body?: string;
  /** Shackle (arch) color */
  shackle?: string;
  /** Keyhole color */
  keyhole?: string;
  /** Outline stroke */
  outline?: string;
  /** Soft glow behind the icon */
  glow?: string;
};

function getLockDefaults(opts?: LockIconOptions): Required<LockIconOptions> {
  return {
    body: opts?.body ?? "rgba(185,28,28,0.95)",
    shackle: opts?.shackle ?? "rgba(120,60,60,0.95)",
    keyhole: opts?.keyhole ?? "rgba(255,255,255,0.85)",
    outline: opts?.outline ?? "rgba(15,23,42,0.65)",
    glow: opts?.glow ?? "rgba(220,38,38,0.20)",
  };
}

export function drawLockTopDown(ctx: CanvasRenderingContext2D, size: number, opts?: LockIconOptions) {
  const { body, shackle, keyhole, outline, glow } = getLockDefaults(opts);

  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const s = size;

  // Glow
  if (glow && glow !== "transparent") {
    const grad = ctx.createRadialGradient(cx, cx, s * 0.05, cx, cx, s * 0.5);
    grad.addColorStop(0, glow);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cx, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shackle (U-shape arch)
  const shackleW = s * 0.19;
  const shackleR = s * 0.16;
  const shackleTopY = s * 0.14;
  const shackleMidY = s * 0.42;

  ctx.save();
  ctx.lineWidth = shackleW;
  ctx.strokeStyle = shackle;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const archX1 = cx - shackleR;
  const archX2 = cx + shackleR;
  ctx.moveTo(archX1, shackleMidY);
  ctx.lineTo(archX1, shackleTopY + shackleR);
  ctx.arcTo(archX1, shackleTopY, cx, shackleTopY, shackleR);
  ctx.arcTo(archX2, shackleTopY, archX2, shackleTopY + shackleR, shackleR);
  ctx.lineTo(archX2, shackleMidY);
  ctx.stroke();
  ctx.restore();

  // Lock body (rounded rectangle, lower 55% of icon)
  const bodyX = s * 0.15;
  const bodyY = s * 0.38;
  const bodyW = s * 0.70;
  const bodyH = s * 0.50;
  const bodyR = s * 0.09;

  ctx.save();
  const bodyGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + bodyH);
  bodyGrad.addColorStop(0, body);
  bodyGrad.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(bodyX + bodyR, bodyY);
  ctx.lineTo(bodyX + bodyW - bodyR, bodyY);
  ctx.arcTo(bodyX + bodyW, bodyY, bodyX + bodyW, bodyY + bodyR, bodyR);
  ctx.lineTo(bodyX + bodyW, bodyY + bodyH - bodyR);
  ctx.arcTo(bodyX + bodyW, bodyY + bodyH, bodyX + bodyW - bodyR, bodyY + bodyH, bodyR);
  ctx.lineTo(bodyX + bodyR, bodyY + bodyH);
  ctx.arcTo(bodyX, bodyY + bodyH, bodyX, bodyY + bodyH - bodyR, bodyR);
  ctx.lineTo(bodyX, bodyY + bodyR);
  ctx.arcTo(bodyX, bodyY, bodyX + bodyR, bodyY, bodyR);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.stroke();
  ctx.restore();

  // Keyhole circle + slot
  const khCx = cx;
  const khCy = bodyY + bodyH * 0.42;
  const khR = s * 0.09;
  ctx.fillStyle = keyhole;
  ctx.beginPath();
  ctx.arc(khCx, khCy, khR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = keyhole;
  ctx.beginPath();
  ctx.moveTo(khCx - s * 0.04, khCy + khR * 0.5);
  ctx.lineTo(khCx + s * 0.04, khCy + khR * 0.5);
  ctx.lineTo(khCx + s * 0.028, khCy + khR * 2.1);
  ctx.lineTo(khCx - s * 0.028, khCy + khR * 2.1);
  ctx.closePath();
  ctx.fill();

  // Shine highlight on body
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  ctx.beginPath();
  ctx.moveTo(bodyX + bodyR * 1.5, bodyY + s * 0.02);
  ctx.lineTo(bodyX + bodyW * 0.55, bodyY + s * 0.02);
  ctx.lineTo(bodyX + bodyW * 0.55, bodyY + bodyH * 0.28);
  ctx.lineTo(bodyX + bodyR * 1.5, bodyY + bodyH * 0.28);
  ctx.closePath();
  ctx.fill();
}

export function createLockIconCanvas(size: number, opts?: LockIconOptions): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawLockTopDown(ctx, size, opts);
  return canvas;
}

export function createLockIconDataUrl(size: number, opts?: LockIconOptions): string | null {
  const canvas = createLockIconCanvas(size, opts);
  return canvas ? canvas.toDataURL("image/png") : null;
}
