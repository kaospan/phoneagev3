// Shared between the real top-down game board (GameTop2D) and the tutorial mini-grid
// (TutorialOverlay) so the "breakable rock" reads identically in both places.
//
// Built from the same "flat-shaded facets fanning out from a center point" technique the
// adjacent solid stone wall tile uses (see StoneWallTile in GameTop2D.tsx), so it reads as part
// of the same tile set — but split into more, irregular facets around a visible impact pit, with
// jagged (not straight) crack seams and a warmer palette, so it unmistakably reads as "shattered"
// rather than "a faceted gem". Inspired by the sprite-view mode's rock (a mosaic of separately
// shaded chunks divided by dark mortar gaps), simplified into fewer/larger modern flat facets.
const lighten = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) + 255 * amt)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) + 255 * amt)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) + 255 * amt)));
  return `rgb(${r},${g},${b})`;
};

const ROCK_BASE = "#8A6238";

// Center point + 6 border points (all 4 corners plus 2 extra edge points for a couple of
// smaller slivers) — the wedges C→Bn→Bn+1 tile the whole square with no gaps at the rim.
const C: [number, number] = [50, 48];
const BORDER: [number, number][] = [
  [0, 0], // TL corner
  [56, 0], // extra point on top edge
  [100, 0], // TR corner
  [100, 100], // BR corner
  [40, 100], // extra point on bottom edge
  [0, 100], // BL corner
];
// Per-facet lightness offset relative to ROCK_BASE — brightest at top, darkest at bottom,
// mirroring StoneWallTile's top-light/bottom-dark convention.
const SHADE_OFFSETS = [0.30, 0.06, -0.18, -0.42, -0.30, 0.02];

// Jagged (not straight) center→border seams: [center, jittered-midpoint, border].
const CRACK_MIDPOINTS: [number, number][] = [
  [24, 20],
  [56, 20],
  [80, 18],
  [82, 78],
  [42, 80],
  [18, 78],
];

export const CrackedRockTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      {BORDER.map((_, i) => (
        <linearGradient key={i} id={`crk${uid}-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={lighten(ROCK_BASE, SHADE_OFFSETS[i] + 0.14)} />
          <stop offset="100%" stopColor={lighten(ROCK_BASE, SHADE_OFFSETS[i] - 0.10)} />
        </linearGradient>
      ))}
    </defs>

    {/* Dark mortar/gap base showing through at the crack seams and center pit */}
    <rect width="100" height="100" fill="#2E1B0E" />

    {/* Six irregular facets fanning out from the center, each its own flat-shaded chunk */}
    {BORDER.map((b, i) => {
      const next = BORDER[(i + 1) % BORDER.length];
      return (
        <polygon
          key={i}
          points={`${C[0]},${C[1]} ${b[0]},${b[1]} ${next[0]},${next[1]}`}
          fill={`url(#crk${uid}-${i})`}
        />
      );
    })}

    {/* Jagged crack seams between facets — dark core + thin bright rim, like a real fracture */}
    {BORDER.map((b, i) => {
      const mid = CRACK_MIDPOINTS[i];
      const pts = `${C[0]},${C[1]} ${mid[0]},${mid[1]} ${b[0]},${b[1]}`;
      return (
        <g key={i}>
          <polyline points={pts} fill="none" stroke="rgba(20,10,4,0.85)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={pts} fill="none" stroke="rgba(255,222,170,0.22)" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    })}

    {/* A couple of secondary hairline cracks that don't reach the center — extra fracturing */}
    <polyline points="30,66 24,74 27,84" fill="none" stroke="rgba(20,10,4,0.65)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="70,30 78,26 84,32" fill="none" stroke="rgba(20,10,4,0.6)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />

    {/* Impact pit at the center where all the cracks meet */}
    <circle cx={C[0]} cy={C[1]} r="4.5" fill="rgba(15,8,3,0.65)" />
    <circle cx={C[0]} cy={C[1]} r="2" fill="rgba(0,0,0,0.55)" />

    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.40)" strokeWidth="1.5" />
  </svg>
);

export const RockCrumbleEffect = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden">
    <div className="absolute inset-[7%] rounded-full bg-stone-200/20 blur-[2px] animate-rock-dust" />
    <div className="absolute left-[14%] top-[19%] h-[22%] w-[18%] rotate-12 rounded-[2px] bg-[#9A7248] shadow-sm animate-rock-chip-a" />
    <div className="absolute right-[15%] top-[24%] h-[16%] w-[23%] -rotate-6 rounded-[2px] bg-[#B08658] shadow-sm animate-rock-chip-b" />
    <div className="absolute bottom-[16%] left-[40%] h-[18%] w-[17%] rotate-45 rounded-[2px] bg-[#6B4525] shadow-sm animate-rock-chip-c" />
    <div
      className="absolute inset-[24%] rounded-full animate-rock-dust"
      style={{
        background: "radial-gradient(circle, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.18) 46%, transparent 72%)",
      }}
    />
  </div>
);
