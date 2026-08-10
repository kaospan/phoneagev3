import React, { useEffect, useMemo, useRef, useState } from "react";
import { isArrowCell } from "@/game/arrows";
import { buildGoalCaveKeySet } from "@/game/caves";
import dinotoonUrl from "@/assets/dinotoon.png";
import { themes, type ColorTheme } from "@/data/levels";
import {
  createKeyIconDataUrl,
  createLockIconDataUrl,
  createHourglassIconDataUrl,
  createVortexIconDataUrl,
} from "@/lib/canvasIcons";
import { CaveTile } from "@/components/tiles/CaveTile";
import { CrackedRockTile, RockCrumbleEffect } from "@/components/tiles/CrackedRockTile";
import { ArrowBg, ArrowGlyph } from "@/components/tiles/ArrowTile";

type PlayerFacing = "up" | "right" | "down" | "left";

interface GameTop2DProps {
   grid: number[][];
   cavePos: { x: number; y: number };
   playerStart?: { x: number; y: number } | null;
   selectedArrow?: { x: number; y: number } | null;
   selectorPos?: { x: number; y: number } | null;
   players: Array<{
     id: string;
     pos: { x: number; y: number };
     facing: PlayerFacing;
     color: string;
     isLocal?: boolean;
     teleportWarpTicksLeft?: number;
   }>;
   zoomFactor?: number;
   fullBleed?: boolean;
   rotateUpright?: boolean;
   theme?: ColorTheme;
   /** Non-empty while the player has been idle on an arrow tile long enough to flash a hint. */
   idleArrowHintDirections?: { dx: number; dy: number }[];
    /** Identifies the current level so a fresh load (new id) can play its one-shot intro beat. */
    levelId?: number | string | null;
    /** Active crumble-animation progress keyed by "x,y" tile coordinate. */
    crumbleAnimations?: Map<string, number>;
    onArrowClick?: (x: number, y: number) => void;
    onCancelSelection?: () => void;
  }

// ─── Color helpers (for theme-driven tile shading) ────────────────────────────

const hexToRgbTriple = (hex: string): [number, number, number] => {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const bigint = parseInt(full, 16);
  if (Number.isNaN(bigint)) return [128, 128, 128];
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

const mixHex = (hex: string, amount: number, toward: 0 | 255): string => {
  const [r, g, b] = hexToRgbTriple(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const nr = clamp(r + (toward - r) * amount);
  const ng = clamp(g + (toward - g) * amount);
  const nb = clamp(b + (toward - b) * amount);
  return `rgb(${nr}, ${ng}, ${nb})`;
};

const lightenHex = (hex: string, amount: number) => mixHex(hex, amount, 255);
const darkenHex = (hex: string, amount: number) => mixHex(hex, amount, 0);

const blendHex = (source: string, target: string, amount: number): string => {
  const [sr, sg, sb] = hexToRgbTriple(source);
  const [tr, tg, tb] = hexToRgbTriple(target);
  const mix = (from: number, to: number) => Math.round(from + (to - from) * amount);
  return `rgb(${mix(sr, tr)}, ${mix(sg, tg)}, ${mix(sb, tb)})`;
};

/** Small stable hash so per-tile texture flecks are deterministic (no re-randomizing on re-render). */
const hashUid = (uid: string): number => {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return h;
};

const SPRITE_ZOOM_BASELINE_FACTOR = 0.66;

// ─── Tile Components ─────────────────────────────────────────────────────────

const VoidTile = () => (
  <div className="w-full h-full" style={{ background: "#060508" }} />
);

/** Muted cave sand with enough texture to read without competing with objectives. */
const FloorTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`fg${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#947A55" />
        <stop offset="50%" stopColor="#766044" />
        <stop offset="100%" stopColor="#584531" />
      </linearGradient>
      {/* Warm top-light bloom */}
      <radialGradient id={`fgl${uid}`} cx="28%" cy="28%" r="55%">
        <stop offset="0%" stopColor="rgba(238,218,168,0.16)" />
        <stop offset="100%" stopColor="rgba(238,218,168,0)" />
      </radialGradient>
    </defs>
    {/* Sandy dirt base */}
    <rect width="100" height="100" fill={`url(#fg${uid})`} />
    {/* Top-light sheen */}
    <rect width="100" height="100" fill={`url(#fgl${uid})`} />
    {/* Pebbles — each: outer shadow circle, main pebble, tiny shine */}
    <circle cx="18" cy="15" r="4.8" fill="rgba(70,35,5,0.20)" />
    <circle cx="18" cy="15" r="4.0" fill="rgba(155,96,28,0.55)" />
    <circle cx="17" cy="14" r="1.3" fill="rgba(255,215,120,0.32)" />

    <circle cx="74" cy="22" r="3.8" fill="rgba(70,35,5,0.18)" />
    <circle cx="74" cy="22" r="3.1" fill="rgba(148,88,22,0.50)" />
    <circle cx="73.2" cy="21.2" r="1.0" fill="rgba(255,215,120,0.28)" />

    <circle cx="38" cy="56" r="5.2" fill="rgba(70,35,5,0.20)" />
    <circle cx="38" cy="56" r="4.3" fill="rgba(152,92,24,0.52)" />
    <circle cx="37" cy="55" r="1.5" fill="rgba(255,215,120,0.30)" />

    <circle cx="84" cy="62" r="4.0" fill="rgba(70,35,5,0.18)" />
    <circle cx="84" cy="62" r="3.3" fill="rgba(145,85,20,0.50)" />
    <circle cx="83.2" cy="61.2" r="1.0" fill="rgba(255,215,120,0.26)" />

    <circle cx="58" cy="84" r="4.4" fill="rgba(70,35,5,0.20)" />
    <circle cx="58" cy="84" r="3.6" fill="rgba(150,90,22,0.52)" />
    <circle cx="57" cy="83" r="1.2" fill="rgba(255,215,120,0.28)" />

    <circle cx="12" cy="74" r="3.2" fill="rgba(70,35,5,0.16)" />
    <circle cx="12" cy="74" r="2.6" fill="rgba(140,80,18,0.46)" />

    <circle cx="88" cy="86" r="3.6" fill="rgba(70,35,5,0.16)" />
    <circle cx="88" cy="86" r="2.9" fill="rgba(142,82,18,0.46)" />

    <circle cx="50" cy="30" r="2.8" fill="rgba(70,35,5,0.15)" />
    <circle cx="50" cy="30" r="2.2" fill="rgba(136,78,16,0.42)" />

    <circle cx="28" cy="88" r="2.5" fill="rgba(70,35,5,0.14)" />
    <circle cx="28" cy="88" r="2.0" fill="rgba(134,76,16,0.40)" />
    {/* Fine dirt-grain arc marks */}
    <path d="M30,38 Q38,34 44,38" fill="none" stroke="rgba(65,32,4,0.16)" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M62,50 Q68,46 74,50" fill="none" stroke="rgba(65,32,4,0.13)" strokeWidth="1.0" strokeLinecap="round" />
    <path d="M6,50 Q12,47 18,50"  fill="none" stroke="rgba(65,32,4,0.12)" strokeWidth="1.0" strokeLinecap="round" />
    <path d="M70,76 Q76,73 82,76" fill="none" stroke="rgba(65,32,4,0.12)" strokeWidth="0.9" strokeLinecap="round" />
    <path d="M24,92 Q29,89 34,92" fill="none" stroke="rgba(65,32,4,0.11)" strokeWidth="0.9" strokeLinecap="round" />
    {/* Edge border */}
    <polygon points="0,0 100,0 94,6 6,6" fill="rgba(255,244,210,0.08)" />
    <rect width="100" height="100" fill="none" stroke="rgba(32,24,16,0.34)" strokeWidth="1.5" />
  </svg>
);

/** Solid stone wall — cool dark slate with clear multi-block look */
const StoneTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`sg${uid}`} x1="0%" y1="10%" x2="100%" y2="90%">
        <stop offset="0%" stopColor="#5E5048" />
        <stop offset="45%" stopColor="#46392D" />
        <stop offset="100%" stopColor="#2E2018" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#sg${uid})`} />
    {/* Top-left face highlight */}
    <polygon points="0,0 100,0 86,13 14,13" fill="rgba(255,255,255,0.14)" />
    <polygon points="0,0 14,13 14,86 0,100" fill="rgba(255,255,255,0.09)" />
    {/* Bottom-right cast shadow */}
    <polygon points="100,100 0,100 14,87 86,87" fill="rgba(0,0,0,0.34)" />
    <polygon points="100,100 100,0 87,14 87,86" fill="rgba(0,0,0,0.24)" />
    {/* Mortar lines suggesting two stones stacked */}
    <line x1="14" y1="52" x2="86" y2="52" stroke="rgba(0,0,0,0.30)" strokeWidth="2" />
    <line x1="14" y1="50" x2="86" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
    {/* Stone grain: upper block */}
    <path d="M20,25 Q32,18 42,26 Q46,31 34,35 Q22,36 20,25Z" fill="rgba(255,255,255,0.06)" />
    <path d="M58,30 Q68,24 76,31 Q78,38 68,40 Q58,40 58,30Z" fill="rgba(0,0,0,0.09)" />
    {/* Stone grain: lower block */}
    <path d="M22,65 Q33,59 42,65 Q44,72 35,74 Q23,73 22,65Z" fill="rgba(255,255,255,0.05)" />
    <path d="M55,68 Q66,63 74,68 Q76,75 66,77 Q55,77 55,68Z" fill="rgba(0,0,0,0.08)" />
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.42)" strokeWidth="1.5" />
  </svg>
);

/**
 * Stone wall — a squat 4-sided pyramid per tile (one square base, 4 triangular faces meeting
 * at a center apex), the same "block" language as the reference art. Repeated edge-to-edge,
 * a run of these reads as one continuous ridge of stone rather than isolated tiles.
 */
const StoneWallTile = ({ uid, baseColor }: { uid: string; baseColor: string }) => {
  const top = lightenHex(baseColor, 0.32);
  const left = lightenHex(baseColor, 0.10);
  const right = darkenHex(baseColor, 0.24);
  const bottom = darkenHex(baseColor, 0.44);
  const h = hashUid(uid);
  const fleckA = { x: 20 + (h % 15), y: 18 + ((h >> 4) % 15) };
  const fleckB = { x: 66 + ((h >> 8) % 16), y: 62 + ((h >> 12) % 18) };
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
      {/* Base fill (guards against hairline seams between adjacent triangles) */}
      <rect width="100" height="100" fill={bottom} />
      {/* 4-sided pyramid: triangles fanning from each edge to the center apex */}
      <polygon points="0,0 100,0 50,50" fill={top} />
      <polygon points="0,0 50,50 0,100" fill={left} />
      <polygon points="100,0 100,100 50,50" fill={right} />
      <polygon points="0,100 50,50 100,100" fill={bottom} />
      {/* Apex highlight — catches the light at the pyramid's peak */}
      <circle cx="50" cy="50" r="3.2" fill="rgba(255,255,255,0.22)" />
      <circle cx="50" cy="50" r="1.3" fill="rgba(255,255,255,0.30)" />
      {/* Subtle hand-hewn texture flecks, deterministic per-tile */}
      <circle cx={fleckA.x} cy={fleckA.y} r="1.6" fill="rgba(0,0,0,0.16)" />
      <circle cx={fleckB.x} cy={fleckB.y} r="1.3" fill="rgba(255,255,255,0.10)" />
      <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.40)" strokeWidth="1.5" />
    </svg>
  );
};

/** Water tile — deep blue with concentric ripples and highlights */
const WaterTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`wg${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1E90E8" />
        <stop offset="40%" stopColor="#1260C0" />
        <stop offset="100%" stopColor="#082878" />
      </linearGradient>
      <radialGradient id={`wc${uid}`} cx="40%" cy="35%" r="45%">
        <stop offset="0%" stopColor="rgba(100,200,255,0.18)" />
        <stop offset="100%" stopColor="rgba(100,200,255,0)" />
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#wg${uid})`} />
    {/* Caustic light patch */}
    <ellipse cx="38" cy="34" rx="28" ry="18" fill={`url(#wc${uid})`} />
    {/* Concentric ripple rings */}
    <ellipse cx="50" cy="55" rx="35" ry="10" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
    <ellipse cx="50" cy="55" rx="24" ry="6.5" fill="none" stroke="rgba(255,255,255,0.17)" strokeWidth="1.1" />
    <ellipse cx="50" cy="55" rx="13" ry="3.5" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="0.9" />
    {/* Secondary ripple set */}
    <ellipse cx="28" cy="36" rx="12" ry="3.5" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.9" />
    {/* Surface shine strokes */}
    <path d="M14,24 Q22,19 30,24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M64,32 Q72,27 80,32" fill="none" stroke="rgba(255,255,255,0.42)" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M20,48 Q27,44 34,48" fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M68,62 Q74,58 80,62" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" strokeLinecap="round" />
    {/* Specular dots */}
    <circle cx="42" cy="28" r="1.6" fill="rgba(255,255,255,0.38)" />
    <circle cx="72" cy="44" r="1.3" fill="rgba(255,255,255,0.30)" />
    <circle cx="24" cy="60" r="1.0" fill="rgba(255,255,255,0.22)" />
    <rect width="100" height="100" fill="none" stroke="rgba(8,40,120,0.50)" strokeWidth="1.5" />
  </svg>
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

// ─── Player / spawn sprites using dinotoon ────────────────────────────────────

/** Player dino — dark oval shadow behind the image so screen-blend keeps strong green */
/** climbOut plays a one-shot "emerging from the cave" beat when a level first loads. */
const PlayerSprite = ({ rotate, climbOut }: { rotate?: boolean; climbOut?: boolean }) => {
  const t = rotate ? "translateX(-50%) rotate(90deg)" : "translateX(-50%)";
  return (
    <div className={climbOut ? "absolute inset-0 animate-climb-out-of-cave" : "contents"}>
      {/* Dark neutral oval: gives screen-blend a dark base so dino stays saturated */}
      <div
        className="pointer-events-none absolute bottom-[3%] left-1/2 h-[140%] w-[140%]"
        style={{
          transform: t,
          background:
            "radial-gradient(ellipse at 50% 58%, rgba(0,0,0,0.60) 0%, rgba(0,0,0,0.30) 42%, rgba(0,0,0,0) 68%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 animate-dino-idle">
        <img
          src={dinotoonUrl}
          alt="Hero"
          className="absolute bottom-[1%] left-1/2 h-[154%] w-[154%] max-w-none object-contain object-bottom"
          style={{
            imageRendering: "auto",
            mixBlendMode: "screen",
            filter: "saturate(1.55) contrast(1.12) drop-shadow(0 2px 0 rgba(7,18,12,0.95)) drop-shadow(0 0 2px rgba(7,18,12,0.9))",
            transform: t,
          }}
        />
      </div>
    </div>
  );
};

// ─── Icon tile (keys, locks, hourglass, teleport) ─────────────────────────────

const IconTile = ({
  iconUrl,
  bgColor,
  rotate,
}: {
  iconUrl: string | null;
  bgColor: string;
  uid: string;
  rotate?: boolean;
}) => {
  if (!iconUrl) return <div className="w-full h-full" style={{ background: bgColor }} />;
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{
        background: `radial-gradient(circle at 50% 45%, rgba(255,255,255,0.12), transparent 58%), ${bgColor}`,
        boxShadow: "inset 0 2px 0 rgba(255,255,255,0.10), inset 0 -4px 10px rgba(0,0,0,0.30)",
      }}
    >
      <img
        src={iconUrl}
        alt=""
        aria-hidden
        className="pointer-events-none"
        style={{
          width: "72%",
          height: "72%",
          objectFit: "contain",
          imageRendering: "auto",
          transform: rotate ? "rotate(90deg)" : undefined,
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.65)) drop-shadow(0 0 5px rgba(255,255,255,0.12))",
        }}
      />
    </div>
  );
};

/** Bright pulsing overlay shown on a teleport pad while a player is mid-warp (hidden, in transit). */
const TeleportFlashOverlay = () => (
  <div
    className="pointer-events-none absolute inset-0 animate-pulse"
    style={{
      background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(210,255,240,0.55) 45%, rgba(52,211,153,0.15) 75%, transparent 100%)",
      mixBlendMode: "screen",
    }}
  />
);

// ─── Main component ──────────────────────────────────────────────────────────

export function GameTop2D({
   grid,
   cavePos,
   playerStart,
   selectedArrow,
   selectorPos,
   players,
   zoomFactor = 1,
   fullBleed = false,
   rotateUpright = false,
   theme,
   idleArrowHintDirections,
   levelId,
   crumbleAnimations,
   onArrowClick,
   onCancelSelection,
 }: GameTop2DProps) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [availableSize, setAvailableSize] = useState({ width: 0, height: 0 });
  const localPlayer = players.find((p) => p.isLocal) ?? players[0];
  const wallColor = blendHex(themes[theme ?? "default"].wall, "#756857", theme === "default" ? 0.25 : 0.55);

  const goalCaveKeys = useMemo(() => buildGoalCaveKeySet(grid, cavePos), [grid, cavePos]);

  // Plays a one-shot "just arrived" beat when a level first loads: the goal ladder pulses so
  // it's clear where you're heading, and the hero's spawn-cave entrance animates them climbing
  // out. Keyed on levelId so it fires exactly once per level, not on every re-render.
  const [showLevelIntro, setShowLevelIntro] = useState(false);
  const introLevelRef = useRef<typeof levelId>(undefined);
  useEffect(() => {
    if (levelId == null || introLevelRef.current === levelId) return;
    introLevelRef.current = levelId;
    setShowLevelIntro(true);
    const t = window.setTimeout(() => setShowLevelIntro(false), 2200);
    return () => window.clearTimeout(t);
  }, [levelId]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    setAvailableSize({ width: Math.max(0, node.offsetWidth), height: Math.max(0, node.offsetHeight) });
    const observer = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r)
        setAvailableSize({
          width: Math.max(0, Math.floor(r.width)),
          height: Math.max(0, Math.floor(r.height)),
        });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = useMemo(
    () => Math.max(0.55, Math.min(1.5, SPRITE_ZOOM_BASELINE_FACTOR / Math.max(0.01, zoomFactor))),
    [zoomFactor],
  );

  const boardSize = useMemo(() => {
    if (rows <= 0 || cols <= 0 || availableSize.width <= 0 || availableSize.height <= 0)
      return { width: 0, height: 0 };
    const aspect = cols / rows;
    // A small permanent frame keeps every edge tile visible, including in the fullscreen
    // presentation where the old overscale made boundary cells disappear beyond the viewport.
    const frameInset = fullBleed ? 12 : 16;
    // Mobile portrait always reserves extra clearance here, even fullBleed/fullscreen, so the
    // board never touches the floating top/bottom HUD bars regardless of minor measurement
    // drift (safe-area insets, HUD bar reflow, sub-pixel rounding).
    const hudSafetyInset = rotateUpright ? 24 : 0;
    const totalInset = frameInset + hudSafetyInset;
    const maxWidth = Math.max(1, availableSize.width - totalInset);
    const maxHeight = Math.max(1, availableSize.height - totalInset);
    const fitWidth = Math.min(maxWidth, maxHeight * aspect);
    const width = Math.max(cols, Math.floor(fitWidth * scale));
    return { width, height: Math.max(rows, Math.floor(width / aspect)) };
  }, [availableSize.height, availableSize.width, cols, fullBleed, rotateUpright, rows, scale]);

  // Icons at 128 px — crisp when downscaled
  const redKeyUrl = useMemo(
    () => (typeof window !== "undefined" ? createKeyIconDataUrl(128, { accent: "rgba(239,68,68,0.98)", glow: "rgba(239,68,68,0.18)" }) : null),
    [],
  );
  const greenKeyUrl = useMemo(
    () => (typeof window !== "undefined" ? createKeyIconDataUrl(128, { accent: "rgba(34,197,94,0.98)", glow: "rgba(34,197,94,0.18)" }) : null),
    [],
  );
  const redLockUrl = useMemo(
    () => (typeof window !== "undefined" ? createLockIconDataUrl(128, { body: "rgba(185,28,28,0.97)", shackle: "rgba(120,20,20,0.95)", glow: "rgba(220,38,38,0.22)" }) : null),
    [],
  );
  const greenLockUrl = useMemo(
    () => (typeof window !== "undefined" ? createLockIconDataUrl(128, { body: "rgba(21,128,61,0.97)", shackle: "rgba(16,80,40,0.95)", keyhole: "rgba(255,255,255,0.85)", glow: "rgba(34,197,94,0.22)" }) : null),
    [],
  );
  const hourglassUrl = useMemo(
    () => (typeof window !== "undefined" ? createHourglassIconDataUrl(128) : null),
    [],
  );
  const teleportUrl = useMemo(
    () => (typeof window !== "undefined" ? createVortexIconDataUrl(128) : null),
    [],
  );

  return (
    <div
      ref={containerRef}
      data-testid="game-top-board"
      className="w-full h-full flex overflow-hidden touch-none select-none items-center justify-center"
      style={{
        background: "radial-gradient(circle at 50% 46%, #171811 0%, #0b0d0b 54%, #050605 100%)",
      }}
      onClick={() => onCancelSelection?.()}
    >
      <div
        data-testid="game-board-object"
        className={[
          fullBleed
            ? "border-0 shadow-none rounded-none"
            : "rounded-md border border-[#ad9164]/35 shadow-[0_20px_70px_rgba(0,0,0,0.72),0_4px_14px_rgba(0,0,0,0.58)]",
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
          className={["grid gap-0 overflow-hidden", fullBleed ? "rounded-none" : "rounded-[4px]"].join(" ")}
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            width: "100%",
            height: "100%",
            backgroundColor: "black",
            boxShadow: "inset 0 0 0 3px rgba(0,0,0,0.88), inset 0 2px 0 rgba(255,255,255,0.09), 0 0 0 1px rgba(255,232,188,0.08)",
            paddingTop: "30px",
          }}
        >
          {grid.map((row, y) =>
            row.map((cell, x) => {
              const uid = `${x}-${y}`;
              const isCave = goalCaveKeys.has(`${x},${y}`);
              const isPlayer = localPlayer?.pos.x === x && localPlayer?.pos.y === y;
              const isPlayerWarping = Boolean(localPlayer && (localPlayer.teleportWarpTicksLeft ?? 0) > 0);
               const tileType = isCave ? 3 : cell;
               const displayTileType = isPlayer && tileType === 18 ? 0 : tileType;
               const isArrow = isArrowCell(cell) || cell === 11 || cell === 12 || cell === 13;
               const isSelected = selectedArrow?.x === x && selectedArrow?.y === y;
               const isSelector = selectorPos?.x === x && selectorPos?.y === y;
               // Arrow tiles stay visible even while the player stands on them — hiding them here
               // used to make it impossible to tell what you were standing on.
               const effectiveTileType = displayTileType;
               const effectiveIsArrow = effectiveTileType >= 7 && effectiveTileType <= 13;
               // Override for crumbling rocks — show the rock tile with crumble animation
               // even though the grid cell has already been set to void (5).
                const isCrumblingRock = crumbleAnimations?.has(`${x},${y}`);
               const renderTileType = isCrumblingRock ? 6 : effectiveTileType;

              const needsUprightIcon =
                effectiveTileType === 3  ||
                effectiveTileType === 18 ||
                effectiveTileType === 16 ||
                effectiveTileType === 17 ||
                effectiveTileType === 20;

               const renderTileBg = () => {
                 switch (renderTileType) {
                   case 5:  return <VoidTile />;
                   case 0:  return <FloorTile uid={uid} />;
                   case 2:  return <StoneTile uid={uid} />;
                   case 6: {
                     return (
                       <div className="relative h-full w-full">
                         {isCrumblingRock && <VoidTile />}
                         {isCrumblingRock && (
                           <div className="absolute inset-0 z-[1]">
                             <RockCrumbleEffect />
                           </div>
                         )}
                         <div
                           className={[
                             "h-full w-full transform-gpu",
                             isCrumblingRock ? "absolute inset-0 z-[2] animate-crumble" : "",
                           ].join(" ")}
                         >
                           <CrackedRockTile uid={uid} />
                         </div>
                       </div>
                     );
                   }
                  case 1:  return <StoneWallTile uid={uid} baseColor={wallColor} />;
                  case 4:  return <WaterTile uid={uid} />;
                  case 3:
                    return (
                      <div className={`relative h-full w-full ${isCave ? "animate-goal-ambient" : ""} ${showLevelIntro && isCave ? "animate-goal-intro-glow" : ""}`}>
                        <CaveTile uid={uid} isStart={false} rotate={rotateUpright} />
                        {isCave && (
                          <div
                            className="pointer-events-none absolute inset-0 animate-goal-sparkles"
                            aria-hidden
                            style={{
                              backgroundImage: "radial-gradient(circle, rgba(255,239,170,0.95) 0 1px, transparent 1.5px), radial-gradient(circle, rgba(255,219,122,0.82) 0 1px, transparent 1.5px), radial-gradient(circle, rgba(255,255,224,0.7) 0 0.8px, transparent 1.3px)",
                              backgroundRepeat: "no-repeat",
                              backgroundSize: "12px 12px, 10px 10px, 8px 8px",
                            }}
                          />
                        )}
                      </div>
                    );
                  case 18: return <CaveTile uid={uid} isStart rotate={rotateUpright} />;
                  case 14: return <IconTile uid={uid} iconUrl={redKeyUrl}    bgColor="rgba(200,30,30,0.20)"   rotate={rotateUpright && needsUprightIcon} />;
                  case 15: return <IconTile uid={uid} iconUrl={greenKeyUrl}  bgColor="rgba(20,160,70,0.20)"   rotate={rotateUpright && needsUprightIcon} />;
                  case 16: return <IconTile uid={uid} iconUrl={redLockUrl}   bgColor="rgba(130,10,10,0.88)"   rotate={rotateUpright && needsUprightIcon} />;
                  case 17: return <IconTile uid={uid} iconUrl={greenLockUrl} bgColor="rgba(10,90,25,0.88)"    rotate={rotateUpright && needsUprightIcon} />;
                  case 19: return <IconTile uid={uid} iconUrl={teleportUrl}  bgColor="rgba(70,0,140,0.78)"    rotate={false} />;
                  case 20: return <IconTile uid={uid} iconUrl={hourglassUrl} bgColor="rgba(100,65,0,0.50)"    rotate={rotateUpright && needsUprightIcon} />;
                  default:
                    if (effectiveIsArrow) return <ArrowBg uid={uid} />;
                    return <FloorTile uid={uid} />;
                }
              };

              return (
                <div
                  key={uid}
                  className={[
                    "relative min-h-0 min-w-0",
                    isPlayer ? "z-10 overflow-visible" : "overflow-hidden",
                    isArrow && !isPlayer ? "cursor-pointer hover:brightness-110" : "",
                    isPlayer && effectiveIsArrow ? "ring-2 ring-amber-300/80" : "",
                    // Deliberately loud — this is the one state where the player's next tap
                    // does something completely different (move the arrow, not themselves), so
                    // it needs to be unmistakable at a glance, not just a thin outline.
                    isSelected ? "z-20 ring-4 ring-white animate-selected-arrow-pulse" : "",
                    isSelector ? "ring-2 ring-emerald-300" : "",
                  ].join(" ")}
                  onClick={
                    isArrow && !isPlayer
                      ? (e) => { e.stopPropagation(); onArrowClick?.(x, y); }
                      : undefined
                  }
                >
                  {renderTileBg()}

                  {effectiveIsArrow && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <ArrowGlyph type={effectiveTileType} />
                    </div>
                  )}

                  {isPlayer && isPlayerWarping && <TeleportFlashOverlay />}
                  {isPlayer && !isPlayerWarping && (
                    <PlayerSprite rotate={rotateUpright} climbOut={showLevelIntro} />
                  )}
                  {isPlayer && renderIdleHintChevrons(idleArrowHintDirections)}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
