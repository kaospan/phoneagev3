import React, { useEffect, useMemo, useRef, useState } from "react";
import { CELL_REFERENCES_UPDATED_EVENT, getCellReferences, type CellReference } from "@/lib/spriteMatching";
import { createBreakableRockTileDataUrl, createHourglassIconDataUrl, createKeyIconDataUrl, createLockIconDataUrl, createVortexIconDataUrl } from "@/lib/canvasIcons";
import { isArrowCell } from "@/game/arrows";
import { buildGoalCaveKeySet } from "@/game/caves";
import { referenceSpriteUrls } from "@/data/assetCatalog";
import { detectGridLines } from "@/components/level-mapper/gridDetection";
import { getAlignmentHints } from "@/components/level-mapper/alignmentProfile";
import { normalizeMapperImage } from "@/components/level-mapper/imageNormalization";
import playerSpriteUrl from "@/assets/dino.png";
import globalFloorUrl from "@/assets/tile-sprites/floor.png";
import globalWallUrl from "@/assets/tile-sprites/wall.png";
import globalStoneUrl from "@/assets/tile-sprites/stone.png";
import globalArrowUpUrl from "@/assets/tile-sprites/arrow-up.png";
import globalArrowRightUrl from "@/assets/tile-sprites/arrow-right.png";
import globalArrowDownUrl from "@/assets/tile-sprites/arrow-down.png";
import globalArrowLeftUrl from "@/assets/tile-sprites/arrow-left.png";
import globalArrowVerticalUrl from "@/assets/tile-sprites/arrow-vertical.png";
import globalArrowHorizontalUrl from "@/assets/tile-sprites/arrow-horizontal.png";
import globalArrowOmniUrl from "@/assets/tile-sprites/arrow-omni.png";

// Real tile crops harvested once from the levels 1-100 screenshots (which do have per-level
// background art). Used as a universal fallback so levels 101-200 (which have no screenshot at
// all) still show authentic textures instead of flat color blocks, and as a last-resort fallback
// for any level whose per-level atlas/reference sprites don't cover a given tile type.
const GLOBAL_TILE_SPRITE_URLS: Record<number, string> = {
  0: globalFloorUrl,
  1: globalWallUrl,
  2: globalStoneUrl,
  7: globalArrowUpUrl,
  8: globalArrowRightUrl,
  9: globalArrowDownUrl,
  10: globalArrowLeftUrl,
  11: globalArrowVerticalUrl,
  12: globalArrowHorizontalUrl,
  13: globalArrowOmniUrl,
};

type PlayerFacing = "up" | "right" | "down" | "left";

interface GameSprite2DProps {
   grid: number[][];
   atlasSourceGrid?: number[][];
   cavePos: { x: number; y: number };
   levelImageUrl?: string | null;
   playerStart?: { x: number; y: number } | null;
   selectedArrow?: { x: number; y: number } | null;
   selectorPos?: { x: number; y: number } | null;
   players: Array<{ id: string; pos: { x: number; y: number }; facing: PlayerFacing; color: string; isLocal?: boolean }>;
   zoomFactor?: number;
   fullBleed?: boolean;
   rotateUpright?: boolean;
   /** Non-empty while the player has been idle on an arrow tile long enough to flash a hint. */
   idleArrowHintDirections?: { dx: number; dy: number }[];
    /** Map of cell keys "x,y" to crumble animation progress (0-1) for breakable rocks that are crumbling. */
    crumbleAnimations?: Map<string, number>;
    onArrowClick?: (x: number, y: number) => void;
    onCancelSelection?: () => void;
  }

type LevelSpriteAtlas = {
  tileSprites: Record<number, string>;
  heroFootprintKeys?: Set<string>;
  boardBackground?: string;
  status: string;
  confidence?: number;
};

type LevelSpriteAtlasState = {
  key: string;
  atlas: LevelSpriteAtlas;
};

// Sprite mode atlas building is useful even at moderate confidence; only bail out
// when detection is clearly wrong (e.g. sampling black borders/HUD).
const ATLAS_MIN_CONFIDENCE = 0.08;
const SPRITE_ZOOM_BASELINE_FACTOR = 0.66;
const MAX_CACHED_LEVEL_ATLASES = 12;
const RAW_SCREENSHOT_BACKGROUND_SIZE = "112% 113%";
const levelSpriteAtlasCache = new Map<string, LevelSpriteAtlas>();

const getCachedLevelAtlas = (key: string) => {
  const cached = levelSpriteAtlasCache.get(key);
  if (!cached) return null;
  levelSpriteAtlasCache.delete(key);
  levelSpriteAtlasCache.set(key, cached);
  return cached;
};

const cacheLevelAtlas = (key: string, atlas: LevelSpriteAtlas) => {
  levelSpriteAtlasCache.delete(key);
  levelSpriteAtlasCache.set(key, atlas);
  if (levelSpriteAtlasCache.size <= MAX_CACHED_LEVEL_ATLASES) return;
  const oldestKey = levelSpriteAtlasCache.keys().next().value;
  if (oldestKey) levelSpriteAtlasCache.delete(oldestKey);
};

const waitForAtlasWorkSlot = () => new Promise<void>((resolve) => {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => resolve(), { timeout: 250 });
    return;
  }
  window.setTimeout(resolve, 0);
});

const pickLatestByType = (refs: CellReference[]) => {
  const latest = new Map<number, CellReference>();
  for (const ref of refs) {
    const existing = latest.get(ref.tileType);
    if (!existing || ref.timestamp > existing.timestamp) latest.set(ref.tileType, ref);
  }
  return latest;
};

const getSpawnCleanupTileType = (
  grid: number[][],
  playerStart?: { x: number; y: number } | null,
) => {
  if (!playerStart) return 0;
  const staticTerrainTypes = new Set([0, 1, 2, 4, 6]);
  const neighbors = [
    grid[playerStart.y]?.[playerStart.x - 1],
    grid[playerStart.y]?.[playerStart.x + 1],
    grid[playerStart.y + 1]?.[playerStart.x],
    grid[playerStart.y - 1]?.[playerStart.x],
  ];
  return neighbors.find((tileType) => tileType !== undefined && staticTerrainTypes.has(tileType)) ?? 0;
};

const getStartCaveSpriteFallback = () => {
  // Start cave (18) is a synthetic marker we paint into the grid to show the original spawn tile.
  // It does not exist in the level screenshot (the hero covers a floor tile), so sampling it from
  // the screenshot would capture the hero. Use the built-in cave reference sprite instead.
  return referenceSpriteUrls.cave;
};

const renderArrowVector = (tileType: number) => {
  const shadow = "drop-shadow(0 1px 1px rgba(0,0,0,0.95)) drop-shadow(0 0 4px rgba(0,0,0,0.72))";
  const common = {
    fill: "#f6c84f",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const OneArrow = ({ dir }: { dir: "up" | "right" | "down" | "left" }) => {
    const rotations = {
      up: 0,
      right: 90,
      down: 180,
      left: 270,
    };

    return (
      <g transform={`rotate(${rotations[dir]} 16 16)`}>
        <path d="M12 26 L12 14 L7 14 L16 5 L25 14 L20 14 L20 26 Z" stroke="rgba(16,18,12,0.92)" strokeWidth="4.2" {...common} />
        <path d="M12 26 L12 14 L7 14 L16 5 L25 14 L20 14 L20 26 Z" stroke="#fff8c8" strokeWidth="1.7" {...common} />
      </g>
    );
  };

  const GlyphPath = ({ d, highlight = true }: { d: string; highlight?: boolean }) => (
    <>
      <path d={d} stroke="rgba(16,18,12,0.92)" strokeWidth="4.2" {...common} />
      {highlight && <path d={d} stroke="#fff8c8" strokeWidth="1.7" {...common} />}
    </>
  );

  const doubleVerticalPath = "M16 3 L26 13 L21 13 L21 19 L26 19 L16 29 L6 19 L11 19 L11 13 L6 13 Z";
  const doubleHorizontalPath = "M3 16 L13 6 L13 11 L19 11 L19 6 L29 16 L19 26 L19 21 L13 21 L13 26 Z";
  const omniPath = "M13 13 L13 8 L10 8 L16 2 L22 8 L19 8 L19 13 L24 13 L24 10 L30 16 L24 22 L24 19 L19 19 L19 24 L22 24 L16 30 L10 24 L13 24 L13 19 L8 19 L8 22 L2 16 L8 10 L8 13 Z";

  const shape =
    tileType === 7 ? <OneArrow dir="up" /> :
    tileType === 8 ? <OneArrow dir="right" /> :
    tileType === 9 ? <OneArrow dir="down" /> :
    tileType === 10 ? <OneArrow dir="left" /> :
    tileType === 11 ? <GlyphPath d={doubleVerticalPath} /> :
    tileType === 12 ? <GlyphPath d={doubleHorizontalPath} /> :
    tileType === 13 ? <GlyphPath d={omniPath} /> :
    null;

  if (!shape) return null;

  return (
    <svg
      viewBox="0 0 32 32"
      className="h-[78%] w-[78%]"
      aria-hidden
      style={{ filter: shadow }}
    >
      {shape}
    </svg>
  );
};

const renderPlayerSprite = (rotate?: boolean) => (
  <img
    src={playerSpriteUrl}
    alt="Hero"
    className="pointer-events-none absolute bottom-[6%] left-1/2 h-[88%] w-[88%] max-w-none object-contain object-bottom"
    style={{ imageRendering: "pixelated", transform: rotate ? 'translateX(-50%) rotate(90deg)' : 'translateX(-50%)' }}
  />
);

const renderSpawnMarkerSprite = (rotate?: boolean) => (
  <img
    src={playerSpriteUrl}
    alt=""
    aria-hidden
    className="pointer-events-none absolute bottom-[10%] left-1/2 h-[62%] w-[62%] max-w-none object-contain object-bottom opacity-40"
    style={{ imageRendering: "pixelated", transform: rotate ? 'translateX(-50%) rotate(90deg)' : 'translateX(-50%)' }}
  />
);

// Direction -> which edge of the tile to hug (inset, staying inside the block) and how much to
// rotate the "points up" chevron shape. Left/right sit above center so they clear the hero's feet.
const IDLE_HINT_DIR_STYLE: Record<string, React.CSSProperties> = {
  "0,-1": { top: "4%", left: "50%", transform: "translate(-50%, 0) rotate(0deg)" },
  "1,0": { top: "32%", right: "3%", transform: "translate(0, -50%) rotate(90deg)" },
  "0,1": { bottom: "4%", left: "50%", transform: "translate(-50%, 0) rotate(180deg)" },
  "-1,0": { top: "32%", left: "3%", transform: "translate(0, -50%) rotate(270deg)" },
};

/** Pulsing chevrons hugging the tile's edges, hinting which way an idle-standing arrow can glide. Kept off the hero's feet (bottom-center) by hugging left/right sides higher up. */
const renderIdleHintChevrons = (directions: { dx: number; dy: number }[] | undefined) => {
  if (!directions || directions.length === 0) return null;
  return directions.map(({ dx, dy }) => {
    const style = IDLE_HINT_DIR_STYLE[`${dx},${dy}`];
    if (!style) return null;
    return (
      <svg
        key={`${dx},${dy}`}
        viewBox="0 0 24 24"
        aria-hidden
        className="pointer-events-none absolute z-30 h-4 w-4 animate-pulse"
        style={{ ...style, filter: "drop-shadow(0 0 4px rgba(0,0,0,0.9))" }}
      >
        <path d="M12 3 L21 15 L15 15 L15 21 L9 21 L9 15 L3 15 Z" fill="#5eead4" stroke="rgba(6,20,20,0.9)" strokeWidth="1.5" />
      </svg>
    );
  });
};

export function GameSprite2D({
   grid,
   atlasSourceGrid,
   cavePos,
   levelImageUrl,
   playerStart,
   selectedArrow,
   selectorPos,
   players,
   zoomFactor = 1,
   fullBleed = false,
   rotateUpright = false,
   idleArrowHintDirections,
   crumbleAnimations,
   onArrowClick,
   onCancelSelection,
 }: GameSprite2DProps) {
  const [references, setReferences] = useState<CellReference[]>(() => {
    if (typeof window === "undefined") return [];
    return getCellReferences();
  });
  const [levelAtlasState, setLevelAtlasState] = useState<LevelSpriteAtlasState | null>(null);

  useEffect(() => {
    const refresh = () => setReferences(getCellReferences());
    window.addEventListener(CELL_REFERENCES_UPDATED_EVENT, refresh as EventListener);
    return () => window.removeEventListener(CELL_REFERENCES_UPDATED_EVENT, refresh as EventListener);
  }, []);

  const latestByType = useMemo(() => pickLatestByType(references), [references]);

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const sourceGrid = atlasSourceGrid ?? grid;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderBaselineRef = useRef<{ key: string; grid: number[][] } | null>(null);
  const [availableSize, setAvailableSize] = useState({ width: 0, height: 0 });
  const localPlayer = players.find((p) => p.isLocal) ?? players[0];
  const atlasGrid = useMemo(() => sourceGrid.map((r) => [...r]), [sourceGrid]);
  const spawnCleanupTileType = useMemo(
    () => getSpawnCleanupTileType(atlasGrid, playerStart),
    [atlasGrid, playerStart],
  );
  const goalCaveKeys = useMemo(() => buildGoalCaveKeySet(grid, cavePos), [grid, cavePos]);
  const atlasGoalCaveKeys = useMemo(() => buildGoalCaveKeySet(sourceGrid, cavePos), [sourceGrid, cavePos]);
  const atlasCacheKey = useMemo(
    () => [
      levelImageUrl ?? "no-image",
      `${rows}x${cols}`,
      `${cavePos.x},${cavePos.y}`,
      `${playerStart?.x ?? -1},${playerStart?.y ?? -1}`,
      atlasGrid.map((row) => row.join(",")).join(";"),
    ].join("|"),
    [atlasGrid, cavePos.x, cavePos.y, cols, levelImageUrl, playerStart?.x, playerStart?.y, rows],
  );
  const levelAtlas = levelAtlasState?.key === atlasCacheKey ? levelAtlasState.atlas : null;
  const renderBaselineKey = `${levelImageUrl ?? "no-image"}|${rows}x${cols}|${cavePos.x},${cavePos.y}|${playerStart?.x ?? -1},${playerStart?.y ?? -1}`;
  if (renderBaselineRef.current?.key !== renderBaselineKey) {
    renderBaselineRef.current = {
      key: renderBaselineKey,
      grid: grid.map((row) => [...row]),
    };
  }

  // Mark board edges (modern + readable): a cell is on the edge if it is non-void and
  // at least one 4-neighbor is void or out-of-bounds.
  const edgeMasks = useMemo(() => {
    if (rows <= 0 || cols <= 0) return [];

    const isVoidAt = (x: number, y: number) => {
      if (y < 0 || y >= rows) return true;
      if (x < 0 || x >= cols) return true;
      // Cave is always treated as non-void for edge purposes.
      if (goalCaveKeys.has(`${x},${y}`)) return false;
      return grid[y]?.[x] === 5;
    };

    return grid.map((row, y) =>
      row.map((cell, x) => {
        const tileType = goalCaveKeys.has(`${x},${y}`) ? 3 : cell;
        if (tileType === 5) return null;
        const top = isVoidAt(x, y - 1);
        const right = isVoidAt(x + 1, y);
        const bottom = isVoidAt(x, y + 1);
        const left = isVoidAt(x - 1, y);
        const any = top || right || bottom || left;
        return { top, right, bottom, left, any };
      })
    );
  }, [goalCaveKeys, grid, rows, cols]);

  useEffect(() => {
    let cancelled = false;
    const setCurrentAtlas = (atlas: LevelSpriteAtlas) => {
      setLevelAtlasState({ key: atlasCacheKey, atlas });
    };
    const updateCurrentAtlas = (update: (current: LevelSpriteAtlas | null) => LevelSpriteAtlas) => {
      setLevelAtlasState((current) => ({
        key: atlasCacheKey,
        atlas: update(current?.key === atlasCacheKey ? current.atlas : null),
      }));
    };
    const setAtlasFailure = (status: string, confidence?: number, keepBoard = true) => {
      updateCurrentAtlas((current) => ({
        tileSprites: current?.tileSprites ?? {},
        heroFootprintKeys: current?.heroFootprintKeys,
        boardBackground: keepBoard ? current?.boardBackground : undefined,
        status,
        confidence: confidence ?? current?.confidence,
      }));
    };

    const loadImage = async (url: string): Promise<HTMLImageElement> => {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load level image: ${url}`));
        img.crossOrigin = "anonymous";
        img.src = url;
      });
    };

    const buildAtlas = async () => {
      if (!levelImageUrl || rows <= 0 || cols <= 0) {
        setLevelAtlasState(null);
        return;
      }

      const cachedAtlas = getCachedLevelAtlas(atlasCacheKey);
      if (cachedAtlas) {
        setCurrentAtlas(cachedAtlas);
        return;
      }

      setCurrentAtlas({
        tileSprites: {},
        status: "Building sprites...",
      });

      // Let React paint the generated board before screenshot normalization and
      // grid detection consume a browser work slot.
      await waitForAtlasWorkSlot();
      if (cancelled) return;

      try {
        // Normalize/crop level screenshots (trim borders + HUD row) so grid detection isn't polluted.
        const normalizedUrl = await normalizeMapperImage(levelImageUrl);
        const img = await loadImage(normalizedUrl);
        if (cancelled) return;

        // Downsample for fast grid detection; scale results back to full-res pixels.
        const maxDim = 1100;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const dsW = Math.max(1, Math.round(img.width * scale));
        const dsH = Math.max(1, Math.round(img.height * scale));
        const dsCanvas = document.createElement("canvas");
        dsCanvas.width = dsW;
        dsCanvas.height = dsH;
        const dsCtx = dsCanvas.getContext("2d", { willReadFrequently: true });
        if (!dsCtx) throw new Error("Failed to create detection canvas context");
        dsCtx.imageSmoothingEnabled = false;
        dsCtx.drawImage(img, 0, 0, dsW, dsH);

        const buildAspectGridFallback = () => {
          if (rows <= 0 || cols <= 0) return null;
          const minCellPx = 16;
          if (dsW < cols * minCellPx || dsH < rows * minCellPx) return null;
          const targetAspect = cols / rows;
          const imageAspect = dsW / dsH;
          if (Math.abs(imageAspect - targetAspect) / targetAspect > 0.18) return null;

          const cellWidth = dsW / cols;
          const cellHeight = dsH / rows;
          if (cellWidth <= 0 || cellHeight <= 0) return null;

          return {
            rows,
            cols,
            offsetX: 0,
            offsetY: 0,
            cellWidth,
            cellHeight,
            runLenX: cols + 1,
            runLenY: rows + 1,
            scoreX: 1,
            scoreY: 1,
            confidence: 0.92,
            durationMs: 0,
            usedRunCounts: false,
          };
        };

        const geometryMatchesAspectFallback = (
          candidate: NonNullable<ReturnType<typeof detectGridLines>>,
          fallback: NonNullable<ReturnType<typeof buildAspectGridFallback>>,
        ) => {
          const candidateCellAspect = candidate.cellWidth / Math.max(1, candidate.cellHeight);
          const fallbackCellAspect = fallback.cellWidth / Math.max(1, fallback.cellHeight);
          return Math.abs(candidateCellAspect - fallbackCellAspect) / fallbackCellAspect <= 0.18;
        };

        let usedAspectGridFallback = false;
        let det = detectGridLines(dsCanvas, true, rows, cols, getAlignmentHints());
        const aspectFallback = buildAspectGridFallback();
        if (
          !det ||
          det.confidence < ATLAS_MIN_CONFIDENCE ||
          (aspectFallback && !geometryMatchesAspectFallback(det, aspectFallback))
        ) {
          if (aspectFallback) {
            det = aspectFallback;
            usedAspectGridFallback = true;
          }
        }
        if (!det) {
          setAtlasFailure("Sprite mode: grid detect failed (using reference sprites)");
          return;
        }

        const allowAtlas = det.confidence >= ATLAS_MIN_CONFIDENCE;

        const scaleX = img.width / dsW;
        const scaleY = img.height / dsH;
        const getFrameMetrics = (gridDetection: NonNullable<typeof det>) => ({
          offsetX: Math.max(0, Math.round(gridDetection.offsetX * scaleX)),
          offsetY: Math.max(0, Math.round(gridDetection.offsetY * scaleY)),
          cellW: Math.max(1, Math.round(gridDetection.cellWidth * scaleX)),
          cellH: Math.max(1, Math.round(gridDetection.cellHeight * scaleY)),
          frameW: Math.max(1, Math.round(gridDetection.cellWidth * cols * scaleX)),
          frameH: Math.max(1, Math.round(gridDetection.cellHeight * rows * scaleY)),
        });
        let { offsetX, offsetY, cellW, cellH, frameW, frameH } = getFrameMetrics(det);
        let frameFitsImage = offsetX + frameW <= img.width + 2 && offsetY + frameH <= img.height + 2;
        if (!frameFitsImage && !usedAspectGridFallback) {
          if (aspectFallback) {
            det = aspectFallback;
            usedAspectGridFallback = true;
            ({ offsetX, offsetY, cellW, cellH, frameW, frameH } = getFrameMetrics(det));
            frameFitsImage = offsetX + frameW <= img.width + 2 && offsetY + frameH <= img.height + 2;
          }
        }
        if (!frameFitsImage) {
          setAtlasFailure("Sprite mode: rejected bad screenshot crop (using reference sprites)", det.confidence, false);
          return;
        }

        // Draw full-res source once.
        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = img.width;
        srcCanvas.height = img.height;
        const sourceContext = srcCanvas.getContext("2d");
        if (!sourceContext) throw new Error("Failed to create sprite canvas context");
        sourceContext.imageSmoothingEnabled = false;
        sourceContext.drawImage(img, 0, 0);

        const boardCanvas = document.createElement("canvas");
        boardCanvas.width = frameW;
        boardCanvas.height = frameH;
        const boardCtx = boardCanvas.getContext("2d");
        if (boardCtx) {
          boardCtx.imageSmoothingEnabled = false;
          boardCtx.drawImage(srcCanvas, offsetX, offsetY, frameW, frameH, 0, 0, frameW, frameH);
        }
        const boardBackground = boardCtx ? boardCanvas.toDataURL("image/png") : undefined;

        const sampleByType = new Map<number, { row: number; col: number }>();
        if (allowAtlas) {
          for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
              const raw = atlasGrid[r]?.[c];
              if (raw === undefined) continue;
              const tileType = atlasGoalCaveKeys.has(`${c},${r}`) ? 3 : raw;
              // Start cave (18) is synthetic; never sample it from the screenshot or we'll capture the hero.
              if (tileType === 18) continue;
              if (!sampleByType.has(tileType)) sampleByType.set(tileType, { row: r, col: c });
            }
          }
        }

        const inset = Math.max(1, Math.round(Math.min(cellW, cellH) * 0.03));
        const outW = 64;
        const outH = 64;

        const cropSourceRect = (sxRaw: number, syRaw: number, sw: number, sh: number) => {
          const sx = Math.max(0, Math.min(srcCanvas.width - sw, sxRaw));
          const sy = Math.max(0, Math.min(srcCanvas.height - sh, syRaw));
          const out = document.createElement("canvas");
          out.width = outW;
          out.height = outH;
          const outCtx = out.getContext("2d");
          if (!outCtx) return null;
          outCtx.imageSmoothingEnabled = false;
          outCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
          return out;
        };

        const cropCell = (row: number, col: number, insetPx = inset, shiftX = 0, shiftY = 0) => {
          const sw = Math.max(1, cellW - insetPx * 2);
          const sh = Math.max(1, cellH - insetPx * 2);
          return cropSourceRect(
            offsetX + col * cellW + insetPx + shiftX,
            offsetY + row * cellH + insetPx + shiftY,
            sw,
            sh,
          );
        };

        const tileSprites: Record<number, string> = {};
        let floorCanvasForSanity: HTMLCanvasElement | null = null;
        let sampledAtlasReliable = true;
        sampleByType.forEach((pos, tileType) => {
          const canvas = cropCell(pos.row, pos.col);
          if (!canvas) return;
          if (tileType === 0) floorCanvasForSanity = canvas;
          tileSprites[tileType] = canvas.toDataURL("image/png");
        });

        // Sanity check: if "floor" is mostly black, we're probably sampling borders/HUD due to bad offset.
        if (floorCanvasForSanity) {
          const ctx = floorCanvasForSanity.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            const data = ctx.getImageData(0, 0, outW, outH).data;
            let sum = 0;
            let nearBlack = 0;
            const total = outW * outH;
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              sum += l;
              if (l < 12) nearBlack += 1;
            }
            const mean = sum / Math.max(1, total);
            const blackFrac = nearBlack / Math.max(1, total);
            if (mean < 28 && blackFrac > 0.55) {
              sampledAtlasReliable = false;
            }
          }
        }

        const heroFootprintKeys = new Set<string>();
        if (playerStart && playerStart.x >= 0 && playerStart.x < cols && playerStart.y >= 0 && playerStart.y < rows) {
          heroFootprintKeys.add(`${playerStart.x},${playerStart.y}`);
          if (playerStart.y > 0) heroFootprintKeys.add(`${playerStart.x},${playerStart.y - 1}`);
        }

        const atlas = {
          tileSprites: sampledAtlasReliable ? tileSprites : {},
          heroFootprintKeys,
          boardBackground,
          status: !sampledAtlasReliable
            ? `Sprites ready (screenshot base; tile atlas rejected at conf ${det.confidence.toFixed(2)})`
            : usedAspectGridFallback
            ? "Sprites ready (aspect grid fallback)"
            : allowAtlas
            ? `Sprites ready (conf ${det.confidence.toFixed(2)})`
            : `Sprite mode: low grid confidence (conf ${det.confidence.toFixed(2)}) - using reference sprites`,
          confidence: det.confidence,
        };
        cacheLevelAtlas(atlasCacheKey, atlas);
        setCurrentAtlas(atlas);
      } catch (e) {
        console.error(e);
        setAtlasFailure("Sprite mode: failed to build sprites (using reference sprites)");
      }
    };

    void buildAtlas();

    return () => {
      cancelled = true;
    };
  }, [levelImageUrl, rows, cols, atlasGoalCaveKeys, atlasGrid, atlasCacheKey, playerStart, sourceGrid]);

  const scale = useMemo(() => {
    // Match gameplay zoom semantics: 0.66 was the old 152% view and is now 100%.
    return Math.max(0.55, Math.min(1.5, SPRITE_ZOOM_BASELINE_FACTOR / Math.max(0.01, zoomFactor)));
  }, [zoomFactor]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    // Use layout dimensions (before CSS transforms) so a rotated parent doesn't corrupt the measurement.
    setAvailableSize({ width: Math.max(0, node.offsetWidth), height: Math.max(0, node.offsetHeight) });
    const observer = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r) setAvailableSize({ width: Math.max(0, Math.floor(r.width)), height: Math.max(0, Math.floor(r.height)) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const boardSize = useMemo(() => {
    if (rows <= 0 || cols <= 0 || availableSize.width <= 0 || availableSize.height <= 0) {
      return { width: 0, height: 0 };
    }

    const aspect = cols / rows;
    const frameInset = fullBleed ? 0 : 16;
    // Mobile portrait always reserves extra clearance here, even fullBleed/fullscreen, so the
    // board never touches the floating top/bottom HUD bars regardless of minor measurement
    // drift (safe-area insets, HUD bar reflow, sub-pixel rounding).
    const hudSafetyInset = rotateUpright ? 24 : 0;
    const totalInset = frameInset + hudSafetyInset;
    const maxWidth = Math.max(1, availableSize.width - totalInset);
    const maxHeight = Math.max(1, availableSize.height - totalInset);
    const fitWidth = Math.min(maxWidth, maxHeight * aspect);
    const width = Math.max(cols, Math.floor(fitWidth * scale));
    return {
      width,
      height: Math.max(rows, Math.floor(width / aspect)),
    };
  }, [availableSize.height, availableSize.width, cols, fullBleed, rotateUpright, rows, scale]);

  const teleportFallbackUrl = useMemo(() => {
    return createVortexIconDataUrl(32);
  }, []);

  const redKeyFallbackUrl = useMemo(() => {
    return createKeyIconDataUrl(32, {
      accent: "rgba(239,68,68,0.98)",
      glow: "rgba(239,68,68,0.18)",
    });
  }, []);

  const greenKeyFallbackUrl = useMemo(() => {
    return createKeyIconDataUrl(32, {
      accent: "rgba(34,197,94,0.98)",
      glow: "rgba(34,197,94,0.18)",
    });
  }, []);

  const bonusTimeFallbackUrl = useMemo(() => {
    return createHourglassIconDataUrl(32);
  }, []);

  const redLockFallbackUrl = useMemo(() => {
    return createLockIconDataUrl(32, {
      body: "rgba(185,28,28,0.97)",
      shackle: "rgba(120,20,20,0.95)",
      glow: "rgba(220,38,38,0.22)",
    });
  }, []);

  const greenLockFallbackUrl = useMemo(() => {
    return createLockIconDataUrl(32, {
      body: "rgba(21,128,61,0.97)",
      shackle: "rgba(16,80,40,0.95)",
      keyhole: "rgba(255,255,255,0.85)",
      glow: "rgba(34,197,94,0.22)",
    });
  }, []);

  const breakableRockFallbackUrl = useMemo(() => {
    return createBreakableRockTileDataUrl(64);
  }, []);

  const startCaveFallbackUrl = useMemo(() => getStartCaveSpriteFallback(), []);
  const startCaveSpriteUrl = levelAtlas?.tileSprites?.[3] ?? startCaveFallbackUrl;
  const goalCaveFallbackUrl = useMemo(() => referenceSpriteUrls.cave, []);
  const processedBoardBackgroundUrl = levelAtlas?.boardBackground ?? null;
  const boardBackgroundUrl = processedBoardBackgroundUrl ?? levelImageUrl ?? null;
  const hasProcessedBoard = Boolean(processedBoardBackgroundUrl);
  const useScreenshotBase = Boolean(boardBackgroundUrl);
  const allowGeneratedFallback = !useScreenshotBase;

  return (
    <div
      ref={containerRef}
      className={[
        "w-full h-full flex overflow-hidden touch-none select-none",
        "items-center justify-center",
      ].join(" ")}
      style={{
        backgroundColor: "black",
      }}
      onClick={() => onCancelSelection?.()}
    >
      <div
        className={[
          fullBleed ? "border-0 shadow-none rounded-none" : "rounded-xl border border-border/40 shadow-lg",
          "relative bg-transparent",
        ].join(" ")}
        style={{
          width: boardSize.width > 0 ? `${boardSize.width}px` : undefined,
          height: boardSize.height > 0 ? `${boardSize.height}px` : undefined,
          maxWidth: scale <= 1 ? "100%" : undefined,
          maxHeight: scale <= 1 ? "100%" : undefined,
        }}
      >
        <div
          data-sprite-status={levelAtlas?.status ?? "no-atlas"}
          data-sprite-has-board={boardBackgroundUrl ? "1" : "0"}
          className={[
            "grid gap-0",
            fullBleed ? "rounded-none" : "rounded-lg",
          ].join(" ")}
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            width: "100%",
            height: "100%",
            backgroundColor: "black",
            backgroundImage: boardBackgroundUrl ? `url(${boardBackgroundUrl})` : undefined,
            backgroundRepeat: "no-repeat",
            backgroundPosition: hasProcessedBoard ? "center" : "center top",
            backgroundSize: hasProcessedBoard ? "100% 100%" : "112% 113%",
            imageRendering: "pixelated",
            boxShadow: useScreenshotBase
              ? undefined
              : "inset 0 0 0 3px rgba(0,0,0,0.92), 0 0 0 1px rgba(255,255,255,0.08)",
          }}
        >
          {grid.map((row, y) =>
            row.map((cell, x) => {
              const isCave = goalCaveKeys.has(`${x},${y}`);
              const isPlayer = localPlayer?.pos.x === x && localPlayer?.pos.y === y;
              const tileType = isCave ? 3 : cell;
              // If the player is standing on the start-marker cave (18), render the base tile as floor
              // so the cave appears only after the hero moves off the spawn tile (nostalgia behavior).
              const displayTileType = isPlayer && tileType === 18 ? 0 : tileType;
              const isArrow = isArrowCell(cell) || cell === 11 || cell === 12 || cell === 13;
              const isSelected = selectedArrow?.x === x && selectedArrow?.y === y;
              const isSelector = selectorPos?.x === x && selectorPos?.y === y;
              const edge = edgeMasks?.[y]?.[x] ?? null;
               // Arrow tiles stay visible even while the player stands on them — hiding them here
               // used to make it impossible to tell what you were standing on.
               const effectiveTileType = displayTileType;
               const effectiveIsArrow = effectiveTileType >= 7 && effectiveTileType <= 13;
               // Override for crumbling rocks — show the rock tile with crumble animation
               // even though the grid cell has already been set to void (5).
               const isCrumblingRock = crumbleAnimations?.has(`${x},${y}`);
               const renderTileType = isCrumblingRock ? 6 : effectiveTileType;
              const originalTileType = atlasGoalCaveKeys.has(`${x},${y}`) ? 3 : (sourceGrid[y]?.[x] ?? tileType);
              const baselineTileType = goalCaveKeys.has(`${x},${y}`)
                ? 3
                : (renderBaselineRef.current?.grid[y]?.[x] ?? originalTileType);
              const originalIsArrow = originalTileType >= 7 && originalTileType <= 13;
              // The original DOS screenshot has the hero (with a visible white-square backdrop)
              // baked into the pixels at the level's spawn tile. Always paint over that spot with
              // clean floor art — regardless of whether the player is still standing there — so
              // our own transparent hero sprite is the only "hero" ever shown, never the
              // screenshot's baked-in one.
              const heroFootprintNeedsCleanup =
                Boolean(useScreenshotBase && levelAtlas?.heroFootprintKeys?.has(`${x},${y}`));
              const playerStartNeedsCleanup =
                Boolean(playerStart && playerStart.x === x && playerStart.y === y) || heroFootprintNeedsCleanup;
              const tileChangedFromScreenshot = effectiveTileType !== baselineTileType;
              const shouldPaintStaticTile = useScreenshotBase
                ? tileChangedFromScreenshot || playerStartNeedsCleanup
                : allowGeneratedFallback;

               const atlasSprite =
                 levelAtlas?.tileSprites?.[renderTileType] ??
                 (useScreenshotBase && renderTileType === 18
                   ? levelAtlas?.tileSprites?.[spawnCleanupTileType]
                   : undefined);
               const refSprite = latestByType.get(renderTileType)?.imageData;
               const canUseRefSprite = renderTileType !== 5;
               const fallbackTileBackgroundImage =
                   renderTileType === 18 ? (startCaveSpriteUrl ? `url(${startCaveSpriteUrl})` : undefined) :
                   renderTileType === 3 && goalCaveFallbackUrl ? `url(${goalCaveFallbackUrl})` :
                   renderTileType === 6 && breakableRockFallbackUrl ? `url(${breakableRockFallbackUrl})` :
                   atlasSprite ? `url(${atlasSprite})` :
                   (canUseRefSprite && refSprite) ? `url(${refSprite})` :
                   GLOBAL_TILE_SPRITE_URLS[renderTileType] ? `url(${GLOBAL_TILE_SPRITE_URLS[renderTileType]})` :
                   renderTileType === 14 && redKeyFallbackUrl ? `url(${redKeyFallbackUrl})` :
                   renderTileType === 15 && greenKeyFallbackUrl ? `url(${greenKeyFallbackUrl})` :
                   renderTileType === 16 && redLockFallbackUrl ? `url(${redLockFallbackUrl})` :
                   renderTileType === 17 && greenLockFallbackUrl ? `url(${greenLockFallbackUrl})` :
                   renderTileType === 19 && teleportFallbackUrl ? `url(${teleportFallbackUrl})` :
                   renderTileType === 20 && bonusTimeFallbackUrl ? `url(${bonusTimeFallbackUrl})` :
                   undefined;
              const staticTileBackgroundImage = useScreenshotBase
                ? (atlasSprite ? `url(${atlasSprite})` : undefined)
                : fallbackTileBackgroundImage;
              const backgroundImage = shouldPaintStaticTile ? staticTileBackgroundImage : undefined;
              // In portrait (rotateUpright), sprite tiles get a counter-rotated child div instead.
              // Caves, locks, and hourglass all need upright rotation; arrows are intentionally NOT rotated.
               const needsUprightSprite = renderTileType === 3 || renderTileType === 18 ||
                 renderTileType === 16 || renderTileType === 17 || renderTileType === 20;
               const useRotatedChild = rotateUpright && needsUprightSprite && Boolean(backgroundImage);
               const cellBackgroundImage = useRotatedChild ? undefined : backgroundImage;
               const arrowVector =
                 effectiveIsArrow && shouldPaintStaticTile && !backgroundImage
                   ? renderArrowVector(renderTileType)
                   : null;

               const fallback =
                 !shouldPaintStaticTile || (useScreenshotBase && !backgroundImage) ? "transparent" :
                 renderTileType === 5 ? "black" :
                 renderTileType === 0 ? "rgba(255,255,255,0.08)" :
                 renderTileType === 4 ? "rgba(30,144,255,0.55)" :
                 renderTileType === 1 ? "rgba(166,124,82,0.78)" :
                 renderTileType === 2 ? "rgba(120,85,60,0.75)" :
                 renderTileType === 6 ? "rgba(160,155,140,0.80)" :
                 renderTileType === 14 ? "rgba(255,70,70,0.70)" :
                 renderTileType === 15 ? "rgba(60,210,120,0.70)" :
                 renderTileType === 16 ? "rgba(150,20,20,0.80)" :
                 renderTileType === 17 ? "rgba(20,110,35,0.80)" :
                 renderTileType === 18 ? "rgba(0,0,0,0.88)" :
                 renderTileType === 20 ? "rgba(251,191,36,0.78)" :
                 effectiveIsArrow ? "rgba(160,120,80,0.88)" :
                 "rgba(255,255,255,0.06)";

               return (
                 <div
                   key={`${x}-${y}`}
                   className={[
                     "relative min-h-0 min-w-0",
                     isPlayer ? "z-10 overflow-visible" : "overflow-hidden",
                     isArrow ? "cursor-pointer hover:brightness-110" : "",
                     isPlayer && effectiveIsArrow ? "ring-2 ring-amber-300/80" : "",
                     isSelected ? "z-20 ring-4 ring-white animate-selected-arrow-pulse" : "",
                     isSelector ? "ring-2 ring-emerald-300" : "",
                     crumbleAnimations?.has(`${x},${y}`) ? "animate-crumble" : "",
                   ].join(" ")}
                  style={{
                    backgroundColor: cellBackgroundImage ? undefined : fallback,
                    backgroundImage: cellBackgroundImage,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    imageRendering: "pixelated",
                    boxShadow:
                      allowGeneratedFallback && !backgroundImage && displayTileType === 0 ? "inset 0 0 0 1px rgba(75,85,99,0.9)" :
                      undefined,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isArrow) onArrowClick?.(x, y);
                  }}
                   title={`Tile ${tileType}`}
                >
                  {edge?.any && allowGeneratedFallback && (
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        borderTop: edge.top ? "2px solid rgba(15,23,42,0.55)" : undefined,
                        borderRight: edge.right ? "2px solid rgba(15,23,42,0.55)" : undefined,
                        borderBottom: edge.bottom ? "2px solid rgba(15,23,42,0.55)" : undefined,
                        borderLeft: edge.left ? "2px solid rgba(15,23,42,0.55)" : undefined,
                        boxShadow: "0 0 0 1px rgba(15,23,42,0.18)",
                        borderRadius: 6,
                      }}
                    />
                  )}
                  {useRotatedChild && (
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        backgroundImage,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        imageRendering: 'pixelated',
                        transform: 'rotate(90deg)',
                      }}
                    />
                  )}
                  {isPlayer && (
                    renderPlayerSprite(rotateUpright)
                  )}
                  {isPlayer && renderIdleHintChevrons(idleArrowHintDirections)}
                  {!isPlayer && effectiveTileType === 18 && playerStart && x === playerStart.x && y === playerStart.y && (
                    renderSpawnMarkerSprite(rotateUpright)
                  )}
                  {arrowVector && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      {arrowVector}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
