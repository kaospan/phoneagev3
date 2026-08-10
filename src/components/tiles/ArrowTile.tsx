// Shared between the real top-down game board (GameTop2D) and the tutorial mini-grid
// (TutorialOverlay) — the actual amber arrow-block tile (background + glyph together), so a
// tutorial demonstrating an arrow moving shows the same block the player sees in real gameplay,
// not just a bare glyph floating on its own.
export const ArrowBg = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`tabg${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#59746A" />
        <stop offset="50%" stopColor="#3E5D55" />
        <stop offset="100%" stopColor="#293F3A" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#tabg${uid})`} />
    <polygon points="0,0 100,0 86,13 14,13" fill="rgba(225,255,246,0.11)" />
    <polygon points="0,0 14,13 14,86 0,100" fill="rgba(225,255,246,0.07)" />
    <polygon points="100,100 0,100 14,87 86,87" fill="rgba(0,0,0,0.36)" />
    <polygon points="100,100 100,0 87,14 87,86" fill="rgba(0,0,0,0.29)" />
    <line x1="14" y1="50" x2="86" y2="50" stroke="rgba(0,0,0,0.20)" strokeWidth="1.4" />
    <line x1="50" y1="14" x2="50" y2="86" stroke="rgba(0,0,0,0.20)" strokeWidth="1.4" />
    <rect width="100" height="100" fill="none" stroke="rgba(4,24,23,0.58)" strokeWidth="1.5" />
  </svg>
);

const ARROW_COMMON = { fill: "#d8e8d8", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ARROW_SHADOW = "drop-shadow(0 1px 1px rgba(0,0,0,0.86))";
const ONE_ARROW_PATH = "M12 26 L12 14 L7 14 L16 5 L25 14 L20 14 L20 26 Z";
const DOUBLE_VERTICAL_PATH = "M16 3 L26 13 L21 13 L21 19 L26 19 L16 29 L6 19 L11 19 L11 13 L6 13 Z";
const DOUBLE_HORIZONTAL_PATH = "M3 16 L13 6 L13 11 L19 11 L19 6 L29 16 L19 26 L19 21 L13 21 L13 26 Z";
const OMNI_PATH = "M13 13 L13 8 L10 8 L16 2 L22 8 L19 8 L19 13 L24 13 L24 10 L30 16 L24 22 L24 19 L19 19 L19 24 L22 24 L16 30 L10 24 L13 24 L13 19 L8 19 L8 22 L2 16 L8 10 L8 13 Z";
const ONE_ARROW_ROTATIONS: Record<"up" | "right" | "down" | "left", number> = { up: 0, right: 90, down: 180, left: 270 };

const GlyphPath = ({ d }: { d: string }) => (
  <>
    <path d={d} stroke="rgba(16,18,12,0.92)" strokeWidth="4.2" {...ARROW_COMMON} />
    <path d={d} stroke="#fff8c8" strokeWidth="1.7" {...ARROW_COMMON} />
  </>
);

export const ArrowGlyph = ({ type }: { type: number }) => {
  const shape =
    type === 7 ? <g transform={`rotate(${ONE_ARROW_ROTATIONS.up} 16 16)`}><GlyphPath d={ONE_ARROW_PATH} /></g> :
    type === 8 ? <g transform={`rotate(${ONE_ARROW_ROTATIONS.right} 16 16)`}><GlyphPath d={ONE_ARROW_PATH} /></g> :
    type === 9 ? <g transform={`rotate(${ONE_ARROW_ROTATIONS.down} 16 16)`}><GlyphPath d={ONE_ARROW_PATH} /></g> :
    type === 10 ? <g transform={`rotate(${ONE_ARROW_ROTATIONS.left} 16 16)`}><GlyphPath d={ONE_ARROW_PATH} /></g> :
    type === 11 ? <GlyphPath d={DOUBLE_VERTICAL_PATH} /> :
    type === 12 ? <GlyphPath d={DOUBLE_HORIZONTAL_PATH} /> :
    type === 13 ? <GlyphPath d={OMNI_PATH} /> :
    null;
  if (!shape) return null;
  return (
    <svg viewBox="0 0 32 32" className="h-[78%] w-[78%]" aria-hidden style={{ filter: ARROW_SHADOW }}>
      {shape}
    </svg>
  );
};

/** The full arrow block — amber tile background plus its directional glyph, as one unit. */
export const ArrowTile = ({ uid, type }: { uid: string; type: number }) => (
  <div className="relative h-full w-full">
    <ArrowBg uid={uid} />
    <div className="absolute inset-0 flex items-center justify-center">
      <ArrowGlyph type={type} />
    </div>
  </div>
);
