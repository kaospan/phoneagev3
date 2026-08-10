import { stageImageSets } from '@/data/assetCatalog';
import { loadCustomLevelDefinition, loadCustomLevelIds } from '@/lib/customLevels';
import promotedLevelDefaultsRaw from '@/data/promoted-levels.json';
import { DEFAULT_LEVEL_TIME_LIMITS } from './defaultLevelTimes';

// PhoneAge game levels
// Legend: 
// 0 = floor, 1 = wall/fire, 2 = stone, 3 = cave entrance, 4 = water, 5 = void/air, 6 = breakable rock
// 7 = arrow up, 8 = arrow right, 9 = arrow down, 10 = arrow left
// 11 = up-down arrow, 12 = left-right arrow, 13 = omnidirectional arrow (all 4 directions)
// 14 = red key, 15 = green key
// 16 = red lock, 17 = green lock
// 18 = start cave marker (non-goal), 19 = teleport pad (paired in reading order)
// 20 = Bonus Time collectible (adds time to the per-level countdown timer)

export type ArrowDirection = 'up' | 'right' | 'down' | 'left';

export type ColorTheme =
  | 'default'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'lava'
  | 'crystal'
  | 'neon'
  | 'snow'
  | 'gray'
  | 'slate';

export type LevelProvenance = 'user-edited' | 'ai-detected';

export interface ThemeColors {
  floor: string;
  wall: string;
  stone: string;
  cave: string;
  arrow: string;
  breakable: string;
  player: string;
  ambient: string;
  background: string;
}

export const themes: Record<ColorTheme, ThemeColors> = {
  default: {
    floor: '#d4a574',
    wall: '#a67c52',
    stone: '#6b4423',
    cave: '#8b4513',
    arrow: '#cd853f',
    breakable: '#4a9eff',
    player: '#00ff00',
    ambient: '#fff5e6',
    background: 'from-amber-50 to-orange-100'
  },
  ocean: {
    floor: '#87ceeb',
    wall: '#4682b4',
    stone: '#1e90ff',
    cave: '#00bfff',
    arrow: '#40e0d0',
    breakable: '#20b2aa',
    player: '#ffff00',
    ambient: '#e0f7fa',
    background: 'from-blue-50 to-cyan-100'
  },
  forest: {
    floor: '#90ee90',
    wall: '#228b22',
    stone: '#556b2f',
    cave: '#8b4513',
    arrow: '#9acd32',
    breakable: '#32cd32',
    player: '#ff69b4',
    ambient: '#f1f8e9',
    background: 'from-green-50 to-emerald-100'
  },
  sunset: {
    floor: '#ffb347',
    wall: '#ff6347',
    stone: '#cd5c5c',
    cave: '#8b0000',
    arrow: '#ff69b4',
    breakable: '#ff1493',
    player: '#ffff00',
    ambient: '#fff3e0',
    background: 'from-orange-100 to-pink-200'
  },
  lava: {
    floor: '#ff4500',
    wall: '#8b0000',
    stone: '#b22222',
    cave: '#ff8c00',
    arrow: '#ffa500',
    breakable: '#ff6347',
    player: '#00ffff',
    ambient: '#ffe4e1',
    background: 'from-red-100 to-orange-200'
  },
  crystal: {
    floor: '#e6e6fa',
    wall: '#9370db',
    stone: '#8a2be2',
    cave: '#9400d3',
    arrow: '#da70d6',
    breakable: '#ba55d3',
    player: '#ffff00',
    ambient: '#f3e5f5',
    background: 'from-purple-50 to-pink-100'
  },
  neon: {
    floor: '#00ff00',
    wall: '#ff00ff',
    stone: '#00ffff',
    cave: '#ff1493',
    arrow: '#ffff00',
    breakable: '#ff69b4',
    player: '#ffffff',
    ambient: '#1a1a2e',
    background: 'from-gray-900 to-purple-900'
  },
  snow: {
    floor: '#f8fafc',
    wall: '#cbd5e1',
    stone: '#94a3b8',
    cave: '#475569',
    arrow: '#38bdf8',
    breakable: '#60a5fa',
    player: '#0f766e',
    ambient: '#ffffff',
    background: 'from-slate-50 to-sky-100'
  },
  gray: {
    floor: '#d4d4d8',
    wall: '#a1a1aa',
    stone: '#71717a',
    cave: '#3f3f46',
    arrow: '#e4e4e7',
    breakable: '#94a3b8',
    player: '#facc15',
    ambient: '#f5f5f5',
    background: 'from-zinc-100 to-stone-300'
  },
  slate: {
    floor: '#cbd5e1',
    wall: '#64748b',
    stone: '#334155',
    cave: '#0f172a',
    arrow: '#7dd3fc',
    breakable: '#94a3b8',
    player: '#fde68a',
    ambient: '#f8fafc',
    background: 'from-slate-100 to-slate-400'
  }
};

export interface Level {
  id: number;
  grid: number[][];
  playerStart: { x: number; y: number };
  cavePos: { x: number; y: number };
  provenance?: LevelProvenance;
  theme?: ColorTheme;
  /**
   * Optional per-level countdown timer (in seconds). When set to a positive number,
   * gameplay will display a countdown and show a "TIME'S UP!" banner at 0.
   */
  timeLimitSeconds?: number;
  /**
   * Optional hourglass bonuses by cell coordinate (keyed by "x,y").
   * Bonus Time tiles (20) add these seconds to the countdown when collected.
   */
  hourglassBonusByCell?: Record<string, number>;
  hud3d?: Hud3DSettings;
  image?: string;
  sources?: string[];
  autoBuild?: boolean;
  /**
   * When true, ignore any `level_override_<id>` stored in localStorage.
   * Default is false (overrides allowed), which is important for mapper-driven manual corrections.
   */
  lockOverride?: boolean;
}

export interface Hud3DSettings {
  showMoves: boolean;
  showTimer: boolean;
  showRedKeys: boolean;
  showGreenKeys: boolean;
}

export const DEFAULT_3D_HUD_SETTINGS: Hud3DSettings = {
  showMoves: false,
  showTimer: true,
  showRedKeys: true,
  showGreenKeys: true,
};

export const normalizeHud3DSettings = (value: unknown): Hud3DSettings => {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<Record<keyof Hud3DSettings, unknown>>
    : {};
  return {
    showMoves: typeof input.showMoves === 'boolean' ? input.showMoves : DEFAULT_3D_HUD_SETTINGS.showMoves,
    showTimer: typeof input.showTimer === 'boolean' ? input.showTimer : DEFAULT_3D_HUD_SETTINGS.showTimer,
    showRedKeys: typeof input.showRedKeys === 'boolean' ? input.showRedKeys : DEFAULT_3D_HUD_SETTINGS.showRedKeys,
    showGreenKeys: typeof input.showGreenKeys === 'boolean' ? input.showGreenKeys : DEFAULT_3D_HUD_SETTINGS.showGreenKeys,
  };
};

export const isPlaceholderGrid = (grid?: number[][]) => {
  if (!grid || grid.length === 0) return true;
  if (grid.length === 1 && grid[0]?.length === 1 && grid[0][0] === 5) return true;
  return grid.every((row) => row.every((cell) => cell === 5));
};

export const shouldAllowLevelOverride = (level: Level) =>
  level.lockOverride !== true;

const normalizeScreenshotGrid = (grid: number[][]): number[][] => {
  if (
    grid.length === 12 &&
    grid[11]?.length === 20 &&
    grid[11].every((cell) => cell === 5)
  ) {
    return grid.slice(0, -1);
  }

  return grid;
};

type PromotedLevelDefault = Pick<
  Level,
  | 'id'
  | 'grid'
  | 'playerStart'
  | 'cavePos'
  | 'provenance'
  | 'theme'
  | 'timeLimitSeconds'
  | 'hourglassBonusByCell'
  | 'hud3d'
  | 'lockOverride'
>;

const coercePromotedLevelDefaults = (value: unknown): PromotedLevelDefault[] => {
  if (!Array.isArray(value)) return [];

  const out: PromotedLevelDefault[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Partial<Record<keyof PromotedLevelDefault, unknown>>;
    const id = Number(e.id);
    const grid = e.grid as unknown;
    const playerStart = e.playerStart as unknown;
    const cavePos = e.cavePos as unknown;

    if (!Number.isInteger(id) || id <= 0) continue;
    if (!Array.isArray(grid) || !Array.isArray(grid[0])) continue;
    if (!playerStart || typeof playerStart !== 'object') continue;
    if (!cavePos || typeof cavePos !== 'object') continue;

    const start = playerStart as Partial<Record<'x' | 'y', unknown>>;
    const cave = cavePos as Partial<Record<'x' | 'y', unknown>>;
    const psx = Number(start.x);
    const psy = Number(start.y);
    const cx = Number(cave.x);
    const cy = Number(cave.y);
    if (![psx, psy, cx, cy].every(Number.isInteger)) continue;

    const rows = grid.length;
    const cols = Array.isArray(grid[0]) ? grid[0].length : 0;
    if (rows <= 0 || cols <= 0) continue;
    if (psx < 0 || psy < 0 || psy >= rows || psx >= cols) continue;
    if (cx < 0 || cy < 0 || cy >= rows || cx >= cols) continue;

    const theme = typeof e.theme === 'string' && (e.theme as string) in themes ? (e.theme as ColorTheme) : undefined;
    const provenance =
      e.provenance === 'user-edited' || e.provenance === 'ai-detected'
        ? (e.provenance as LevelProvenance)
        : id >= 1 && id <= 35
          ? 'user-edited'
          : undefined;
    const timeLimitSeconds =
      e.timeLimitSeconds === undefined ? undefined : Math.max(1, Math.min(86400, Math.round(Number(e.timeLimitSeconds))));

    const hourglassBonusByCell =
      e.hourglassBonusByCell && typeof e.hourglassBonusByCell === 'object' ? (e.hourglassBonusByCell as Record<string, number>) : undefined;
    const hud3d = e.hud3d === undefined ? undefined : normalizeHud3DSettings(e.hud3d);

    out.push({
      id,
      grid: normalizeScreenshotGrid(grid as number[][]),
      playerStart: { x: psx, y: psy },
      cavePos: { x: cx, y: cy },
      ...(provenance ? { provenance } : {}),
      ...(theme ? { theme } : {}),
      ...(Number.isFinite(timeLimitSeconds) ? { timeLimitSeconds } : {}),
      ...(hourglassBonusByCell ? { hourglassBonusByCell } : {}),
      ...(hud3d ? { hud3d } : {}),
      ...(e.lockOverride !== undefined ? { lockOverride: Boolean(e.lockOverride) } : {}),
    });
  }

  return out;
};

const promotedLevelDefaults = coercePromotedLevelDefaults(promotedLevelDefaultsRaw);

const applyDefaultTimeLimits = (levels: Level[]): Level[] =>
  levels.map((level) => {
    const forced = DEFAULT_LEVEL_TIME_LIMITS[level.id];
    return Number.isInteger(forced)
      ? { ...level, timeLimitSeconds: forced }
      : level;
  });

const applyPromotedLevelDefaults = (levels: Level[]): Level[] => {
  if (promotedLevelDefaults.length === 0) return levels;

  const byId = new Map<number, PromotedLevelDefault>();
  for (const p of promotedLevelDefaults) byId.set(p.id, p);

  const seen = new Set<number>();
  const merged = levels.map((l) => {
    const p = byId.get(l.id);
    if (!p) return l;
    seen.add(l.id);
    // These are explicit, user-promoted defaults; never auto-build over them.
    return { ...l, ...p, autoBuild: false };
  });

  for (const p of promotedLevelDefaults) {
    if (seen.has(p.id)) continue;
    merged.push({ ...p, autoBuild: false });
  }

  merged.sort((a, b) => a.id - b.id);
  return merged;
};

const baseManualLevels: Level[] = [
  // Level 1 - User custom grid
  {
    id: 1,
    grid: [
      [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 2, 5, 5],
      [2, 2, 2, 5, 5, 5, 5, 5, 5, 2, 2, 2, 2, 2, 2, 2, 5, 2, 5, 5],
      [2, 2, 2, 5, 5, 5, 5, 2, 2, 2, 5, 5, 5, 5, 0, 0, 5, 2, 5, 5],
      [2, 2, 2, 5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 0, 0, 0, 5, 2, 5, 5],
      [5, 5, 5, 5, 5, 5, 2, 5, 5, 5, 0, 5, 10, 0, 0, 5, 5, 2, 5, 5],
      [5, 5, 5, 5, 5, 5, 2, 5, 5, 0, 0, 5, 10, 0, 5, 2, 2, 2, 5, 5],
      [5, 5, 5, 5, 5, 5, 2, 3, 0, 0, 0, 5, 5, 5, 2, 2, 5, 5, 5, 5],
      [5, 5, 5, 5, 5, 5, 2, 0, 0, 0, 5, 5, 5, 2, 2, 5, 5, 5, 5, 5],
      [5, 5, 2, 2, 2, 5, 2, 2, 2, 2, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5],
      [5, 5, 2, 2, 2, 5, 5, 5, 5, 2, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5],
      [5, 5, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    ],
    playerStart: { x: 15, y: 3 },
    cavePos: { x: 7, y: 6 },
  },
  // Level 2 - Dual-path puzzle: up-down arrow glide or left-right arrow bridge
  {
    id: 2,
    grid: [
      [5, 1, 1, 1, 5, 5, 5, 5, 5, 5, 0, 5, 5],
      [1, 1, 0, 12, 5, 5, 5, 5, 5, 5, 5, 5, 3],
      [1, 0, 0, 1, 1, 0, 0, 1, 1, 5, 5, 5, 5],
      [1, 0, 0, 6, 6, 6, 0, 0, 1, 1, 5, 5, 5],
      [1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 5, 5, 5],
      [1, 1, 0, 1, 5, 1, 1, 0, 0, 0, 11, 1, 5],
      [5, 1, 1, 1, 5, 5, 1, 1, 0, 0, 0, 1, 5],
      [5, 5, 5, 5, 5, 5, 5, 1, 1, 0, 0, 1, 5],
      [5, 5, 5, 5, 5, 5, 5, 5, 1, 1, 1, 1, 5],
    ],
    playerStart: { x: 10, y: 7 },
    cavePos: { x: 12, y: 1 },
  },
  // Level 3 - Horizontal void corrxidor with arrows
  {
    id: 3,
    grid: [[5, 5, 5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], [5, 5, 5, 2, 2, 5, 0, 2, 2, 5, 5, 5, 5, 5, 5, 2, 2, 5, 5, 5], [5, 5, 2, 5, 5, 5, 0, 5, 2, 2, 2, 2, 2, 2, 2, 5, 3, 2, 5, 5], [5, 2, 5, 5, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 2, 5, 5], [2, 5, 5, 5, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 5, 2, 2, 5], [2, 5, 5, 8, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 5], [2, 5, 5, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 5, 5, 5, 2, 5], [5, 2, 5, 7, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 5, 5, 5, 2, 5], [5, 5, 2, 0, 5, 2, 2, 0, 5, 0, 5, 0, 5, 8, 7, 5, 7, 2, 5, 5], [5, 5, 5, 2, 2, 5, 5, 2, 2, 2, 5, 0, 5, 0, 5, 2, 2, 5, 5, 5], [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 2, 2, 2, 5, 5, 5, 5, 5]],
    playerStart: { x: 3, y: 8 },
    cavePos: { x: 10, y: 0 },
  },
  // Level 4 - Stone maze with omnidirectional start
  {
    id: 4,
    grid: [
      [5, 5, 2, 2, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [5, 5, 2, 5, 5, 5, 2, 5, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [5, 5, 2, 2, 2, 5, 2, 2, 2, 3, 2, 5, 5, 5, 5, 2, 2, 2, 5, 5],
      [5, 5, 5, 5, 2, 5, 5, 5, 5, 5, 2, 2, 2, 2, 2, 2, 5, 2, 5, 5],
      [5, 5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 2, 5, 5, 2, 5, 5],
      [5, 5, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 5, 5],
      [5, 5, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 5, 2, 5, 5, 5],
      [5, 5, 2, 13, 2, 2, 2, 2, 5, 5, 5, 5, 5, 5, 2, 2, 2, 5, 5, 5],
      [5, 5, 2, 0, 2, 5, 5, 2, 2, 2, 2, 5, 5, 5, 2, 5, 5, 5, 5, 5],
      [5, 5, 2, 2, 2, 5, 5, 5, 5, 5, 2, 2, 2, 2, 2, 5, 5, 5, 5, 5]
    ],
    playerStart: { x: 3, y: 8 },
    cavePos: { x: 9, y: 2 },
  },
  // Level 5 - User custom grid with arrows and cave
  {
    id: 5,
    grid: [
      [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [5, 5, 5, 5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5, 5, 5],
      [5, 5, 5, 2, 2, 5, 2, 5, 2, 11, 5, 2, 11, 2, 11, 0, 2, 5, 5, 5],
      [5, 5, 5, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 13, 5, 2, 5, 5, 5],
      [5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 5, 5, 5],
      [5, 5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 5, 5, 5, 5],
      [5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 5, 5, 5],
      [5, 5, 5, 2, 5, 13, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 5, 5, 5],
      [5, 5, 5, 2, 3, 11, 2, 11, 2, 5, 5, 2, 5, 2, 5, 2, 2, 5, 5, 5],
      [5, 5, 5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5, 5, 5, 5],
      [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
    ],
    playerStart: { x: 15, y: 2 },
    cavePos: { x: 4, y: 8 },
  },
  // Level 6 - Sample level for testing
  {
    id: 6,
    grid: [
      [5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5], // Row 1
      [5,5,5,2,2,2,5,2,2,2,2,2,2,2,5,5,5,5,5,5], // Row 2
      [5,5,5,2,3,0,2,2,5,5,5,5,5,2,2,2,2,2,5,5], // Row 3
      [5,5,5,2,0,0,5,10,5,2,0,0,5,5,5,10,5,2,5,5], // Row 4
      [5,5,5,5,2,9,5,0,5,5,10,5,2,7,5,5,2,2,5,5], // Row 5
      [5,5,5,5,2,5,8,5,5,5,5,5,0,0,5,5,2,5,5,5], // Row 6
      [5,5,5,2,2,5,0,5,5,2,2,2,2,2,5,0,2,5,5,5], // Row 7
      [5,5,5,2,5,5,5,5,5,10,0,0,5,5,5,10,0,2,5,5], // Row 8
      [5,5,5,2,2,2,2,2,5,5,5,5,5,2,2,0,0,2,5,5], // Row 9
      [5,5,5,5,5,5,5,2,2,2,2,2,2,2,5,2,2,2,5,5], // Row 10
      [5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5] // Row 11
],
    playerStart: { x: 16, y: 8 },
    cavePos: { x: 4, y: 8 }
  },
  // Level 7 - Manual fallback for broken auto-generated start layout
  {
    id: 7,
    grid: [
      [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [5, 5, 5, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 5, 5, 5],
      [5, 5, 2, 2, 0, 0, 5, 2, 5, 5, 5, 5, 5, 5, 2, 0, 2, 11, 5],
      [5, 2, 2, 0, 0, 0, 2, 0, 5, 5, 5, 5, 5, 5, 2, 0, 0, 5, 2],
      [5, 2, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 2, 0, 0, 3, 5, 2],
      [5, 2, 2, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 2, 0, 5, 5, 5],
      // NOTE: Keep a landing floor at (15,6) so the right-arrow raft can stop at x=14 and step onto land.
      [5, 5, 2, 2, 0, 0, 12, 5, 5, 5, 8, 5, 5, 5, 5, 0, 5, 5, 5],
      [5, 5, 5, 2, 2, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
    ],
    playerStart: { x: 4, y: 6 },
    cavePos: { x: 16, y: 4 },
    theme: 'neon'
  },
  // Level 8 - Red key and red lock layout
  {
    id: 8,
    grid: [
      [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2],
      [5, 5, 2, 2, 2, 5, 5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 2],
      [5, 5, 2, 2, 2, 5, 5, 5, 2, 9, 9, 2, 5, 5, 5, 5, 5, 5, 5, 2],
      [5, 5, 2, 2, 2, 5, 5, 2, 9, 5, 5, 9, 2, 5, 5, 5, 5, 5, 5, 5],
      [5, 5, 5, 5, 5, 5, 2, 5, 5, 10, 9, 10, 5, 2, 5, 5, 5, 5, 5, 5],
      [5, 5, 5, 5, 5, 2, 5, 5, 5, 8, 5, 5, 2, 5, 2, 5, 5, 2, 2, 2],
      [5, 5, 5, 5, 2, 0, 11, 5, 8, 5, 5, 5, 16, 11, 3, 2, 5, 2, 2, 2],
      [5, 5, 5, 2, 5, 5, 14, 7, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 2, 2],
      [5, 5, 5, 2, 2, 2, 0, 0, 2, 0, 0, 2, 0, 0, 2, 2, 2, 5, 5, 5],
      [2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
    ],
    playerStart: { x: 6, y: 8 },
    cavePos: { x: 14, y: 6 }
  }
];

export const manualLevels: Level[] = applyDefaultTimeLimits(
  applyPromotedLevelDefaults(baseManualLevels)
);

export const manualFallbackById = new Map(manualLevels.map((level) => [level.id, level]));
const manualById = new Map(manualLevels.map((level) => [level.id, level]));

const buildAutoLevels = (): Level[] => {
  if (stageImageSets.length === 0) {
    return manualLevels;
  }

  const themeCycle: ColorTheme[] = [
    'default',
    'ocean',
    'forest',
    'sunset',
    'lava',
    'crystal',
    'neon',
  ];

  const built = stageImageSets.map((stage) => {
    const manual = manualById.get(stage.id);
    if (manual) {
      return {
        ...manual,
        image: stage.primary,
        sources: stage.sources,
        autoBuild: false,
      };
    }

    return {
      id: stage.id,
      grid: [[5]],
      playerStart: { x: 0, y: 0 },
      cavePos: { x: 0, y: 0 },
      theme: themeCycle[(stage.id - 1) % themeCycle.length],
      image: stage.primary,
      sources: stage.sources,
      autoBuild: true,
    };
  });

  return applyDefaultTimeLimits(built);
};

type VariationMode = 'flip-h' | 'flip-v' | 'flip-hv' | 'rotate90' | 'rotate270';

const flipArrowHorizontal = (cell: number): number => {
  if (cell === 8) return 10;
  if (cell === 10) return 8;
  return cell;
};

const flipArrowVertical = (cell: number): number => {
  if (cell === 7) return 9;
  if (cell === 9) return 7;
  return cell;
};

const rotateArrow90 = (cell: number): number => {
  if (cell === 7) return 8;
  if (cell === 8) return 9;
  if (cell === 9) return 10;
  if (cell === 10) return 7;
  return cell;
};

const rotateArrow270 = (cell: number): number => {
  if (cell === 7) return 10;
  if (cell === 10) return 9;
  if (cell === 9) return 8;
  if (cell === 8) return 7;
  return cell;
};

const transformCellForMode = (cell: number, mode: VariationMode): number => {
  if (mode === 'flip-h') return flipArrowHorizontal(cell);
  if (mode === 'flip-v') return flipArrowVertical(cell);
  if (mode === 'rotate90') return rotateArrow90(cell);
  if (mode === 'rotate270') return rotateArrow270(cell);
  return flipArrowVertical(flipArrowHorizontal(cell));
};

const transformGridForMode = (grid: number[][], mode: VariationMode): number[][] => {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  if (mode === 'rotate90') {
    const out = Array.from({ length: cols }, () => Array.from({ length: rows }, () => 5));
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        out[x][rows - 1 - y] = transformCellForMode(grid[y][x], mode);
      }
    }
    return out;
  }

  if (mode === 'rotate270') {
    const out = Array.from({ length: cols }, () => Array.from({ length: rows }, () => 5));
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        out[cols - 1 - x][y] = transformCellForMode(grid[y][x], mode);
      }
    }
    return out;
  }

  const out = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 5));
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const nextY = mode === 'flip-v' || mode === 'flip-hv' ? rows - 1 - y : y;
      const nextX = mode === 'flip-h' || mode === 'flip-hv' ? cols - 1 - x : x;
      out[nextY][nextX] = transformCellForMode(grid[y][x], mode);
    }
  }
  return out;
};

const transformPosForMode = (
  pos: { x: number; y: number },
  rows: number,
  cols: number,
  mode: VariationMode
) => {
  if (mode === 'rotate90') {
    return { x: rows - 1 - pos.y, y: pos.x };
  }
  if (mode === 'rotate270') {
    return { x: pos.y, y: cols - 1 - pos.x };
  }
  return {
    x: mode === 'flip-h' || mode === 'flip-hv' ? cols - 1 - pos.x : pos.x,
    y: mode === 'flip-v' || mode === 'flip-hv' ? rows - 1 - pos.y : pos.y,
  };
};

const transformHourglassBonusForMode = (
  hourglassBonusByCell: Record<string, number> | undefined,
  rows: number,
  cols: number,
  mode: VariationMode
) => {
  if (!hourglassBonusByCell) return undefined;
  const out: Record<string, number> = {};
  for (const [key, bonus] of Object.entries(hourglassBonusByCell)) {
    const [rawX, rawY] = key.split(',');
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    const next = transformPosForMode({ x, y }, rows, cols, mode);
    out[`${next.x},${next.y}`] = bonus;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

const buildVariationLevels = (baseLevels: Level[]): Level[] => {
  const targetExtraLevels = 100;
  if (baseLevels.length === 0) return [];

  const sourceLevels = baseLevels
    .filter((level) => !isPlaceholderGrid(level.grid))
    .sort((a, b) => a.id - b.id)
    .slice(0, targetExtraLevels);
  if (sourceLevels.length === 0) return [];

  const variationModes: VariationMode[] = ['flip-h', 'flip-v', 'flip-hv', 'rotate90', 'rotate270'];
  const themeCycle: ColorTheme[] = ['default', 'ocean', 'forest', 'sunset', 'lava', 'crystal', 'neon', 'snow', 'gray', 'slate'];
  const maxBaseId = Math.max(...baseLevels.map((level) => level.id));

  return Array.from({ length: targetExtraLevels }, (_, index) => {
    const source = sourceLevels[index % sourceLevels.length];
    const mode = variationModes[index % variationModes.length];
    const rows = source.grid.length;
    const cols = source.grid[0]?.length ?? 0;
    const grid = transformGridForMode(source.grid, mode);
    const playerStart = transformPosForMode(source.playerStart, rows, cols, mode);
    const cavePos = transformPosForMode(source.cavePos, rows, cols, mode);
    const hourglassBonusByCell = transformHourglassBonusForMode(source.hourglassBonusByCell, rows, cols, mode);

    return {
      ...source,
      id: maxBaseId + index + 1,
      grid,
      playerStart,
      cavePos,
      hourglassBonusByCell,
      theme: themeCycle[index % themeCycle.length],
      image: undefined,
      sources: undefined,
      autoBuild: false,
    };
  });
};

const autoLevels = buildAutoLevels();
const variationLevels = buildVariationLevels(autoLevels);

// Promoted defaults are already applied above for ids covered by stageImageSets (1-100, via
// manualById inside buildAutoLevels). Variation levels (101-200+) are generated fresh from
// flipped copies of the base levels and never consult promoted-levels.json, so apply the
// promoted overrides once more here to let promoted entries (e.g. cleared/void levels) win
// for ids outside the auto-built range too.
export const allLevels = applyPromotedLevelDefaults([...autoLevels, ...variationLevels]);

console.log('📦 levels.ts loaded, total levels:', allLevels.length);

// Retrieve levels with any grid overrides stored in localStorage (level_override_<id>)
export const getAllLevels = (): Level[] => {
  console.log('🔍 getAllLevels() called');
  
  try {
    const base = allLevels.map(l => ({ ...l, grid: l.grid.map(row => [...row]) }));
    console.log('✓ Base levels cloned:', base.length);
    
    if (typeof window === 'undefined') {
      console.log('⚠️ SSR mode, returning base levels');
      return applyDefaultTimeLimits(base);
    }

    // Merge in any custom levels created in the mapper (localStorage) without overwriting built-ins.
    // These must be merged *before* override application so `level_override_<id>` works for custom ids too.
    const customIds = loadCustomLevelIds();
    if (customIds.length > 0) {
      const existingIds = new Set(base.map((l) => l.id));
      for (const id of customIds) {
        if (existingIds.has(id)) continue;
        const def = loadCustomLevelDefinition(id);
        if (!def) continue;
        const customProvenance = (def as Partial<Level>).provenance;
        base.push({
          id: def.id,
          grid: def.grid.map((row) => [...row]),
          playerStart: def.playerStart ?? { x: 0, y: 0 },
          cavePos: def.cavePos ?? { x: 0, y: 0 },
          ...(customProvenance ? { provenance: customProvenance } : {}),
          theme: def.theme,
          autoBuild: false,
        });
        existingIds.add(id);
      }
      base.sort((a, b) => a.id - b.id);
    }
    
    console.log('🔍 Checking localStorage for overrides...');
    const withOverrides = base.map(l => {
      if (!shouldAllowLevelOverride(l)) return l;
      const key = `level_override_${l.id}`;
      const raw = localStorage.getItem(key);
      if (!raw) return l;
     try {
         const parsed = JSON.parse(raw);
         // Handle new format: { grid, playerStart }
         if (parsed && typeof parsed === 'object' && parsed.grid) {
           console.log(`✓ Override found for level ${l.id} (new format)`);
           const nextGrid = normalizeScreenshotGrid(parsed.grid as number[][]);
           const result: Level = { ...l, grid: nextGrid };
           if (parsed.playerStart) {
             result.playerStart = parsed.playerStart;
           }
           if (parsed.provenance === 'user-edited' || parsed.provenance === 'ai-detected') {
             result.provenance = parsed.provenance as LevelProvenance;
           }
           if (parsed.theme) {
             // Theme is optional; only accept known theme keys.
             const t = String(parsed.theme);
             if (Object.prototype.hasOwnProperty.call(themes, t)) {
               result.theme = t as ColorTheme;
             }
           }
           if (parsed.timeLimitSeconds !== undefined) {
             const n = Number(parsed.timeLimitSeconds);
             if (Number.isFinite(n) && n > 0) {
               result.timeLimitSeconds = Math.min(86400, Math.round(n));
             } else {
               // Treat 0/null/invalid as "no timer"
               delete result.timeLimitSeconds;
             }
           }
           if (parsed.hourglassBonusByCell && typeof parsed.hourglassBonusByCell === 'object') {
             const out: Record<string, number> = {};
             const grid = nextGrid;
             const maxY = grid.length;
             const maxX = grid[0]?.length ?? 0;
             for (const [k, v] of Object.entries(parsed.hourglassBonusByCell as Record<string, unknown>)) {
               const n = Number(v);
               if (!Number.isFinite(n)) continue;
               const parts = String(k).split(',');
               if (parts.length !== 2) continue;
               const x = Number(parts[0]);
               const y = Number(parts[1]);
               if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
               if (x < 0 || y < 0 || y >= maxY || x >= maxX) continue;
               if (grid[y]?.[x] !== 20) continue;
               const sec = Math.max(1, Math.min(86400, Math.round(n)));
               out[`${x},${y}`] = sec;
             }
             if (Object.keys(out).length > 0) {
               result.hourglassBonusByCell = out;
             } else {
               delete result.hourglassBonusByCell;
             }
           }
           if (parsed.hud3d !== undefined) {
             result.hud3d = normalizeHud3DSettings(parsed.hud3d);
           }
           return result;
         }
         // Handle old format: just the grid array
         if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
           console.log(`✓ Override found for level ${l.id} (old format)`);
          return { ...l, grid: normalizeScreenshotGrid(parsed as number[][]) };
        }
      } catch (err) {
        console.warn(`⚠️ Failed to parse override for level ${l.id}:`, err);
      }
      return l;
    });

    // Normalize: if the player start cell was painted as a cave (3) while there is another cave,
    // treat it as a non-goal start-marker cave (18) so cavePos detection remains correct.
    const normalizedStartMarkers = withOverrides.map((l) => {
      const ps = l.playerStart;
      if (!ps) return l;
      const row = l.grid?.[ps.y];
      if (!row) return l;
      const startCell = row[ps.x];
      // If the start is plain floor, show it as a non-goal start-marker cave (18).
      if (startCell === 0) {
        const nextGrid = l.grid.map((r) => r.slice());
        nextGrid[ps.y][ps.x] = 18;
        return { ...l, grid: nextGrid };
      }
      if (startCell !== 3) return l;

      let hasOtherCave = false;
      for (let y = 0; y < l.grid.length && !hasOtherCave; y += 1) {
        for (let x = 0; x < (l.grid[y]?.length ?? 0); x += 1) {
          if (x === ps.x && y === ps.y) continue;
          if (l.grid[y][x] === 3) {
            hasOtherCave = true;
            break;
          }
        }
      }
      if (!hasOtherCave) return l;

      const nextGrid = l.grid.map((r) => r.slice());
      nextGrid[ps.y][ps.x] = 18;
      return { ...l, grid: nextGrid };
    });

    console.log('🔍 Syncing cave positions...');
    // Ensure cavePos matches the location of tile id 3 in the grid when present
    const result = normalizedStartMarkers.map(l => {
      let caveX = l.cavePos.x;
      let caveY = l.cavePos.y;
      let found = false;
      for (let y = 0; y < l.grid.length && !found; y++) {
        for (let x = 0; x < (l.grid[y]?.length || 0) && !found; x++) {
          if (l.grid[y][x] === 3) {
            caveX = x;
            caveY = y;
            found = true;
          }
        }
      }
      return found ? { ...l, cavePos: { x: caveX, y: caveY } } : l;
    });
    
    console.log('✅ getAllLevels() complete, returning', result.length, 'levels');
    return applyDefaultTimeLimits(result);
  } catch (error) {
    console.error('❌ Error in getAllLevels:', error);
    console.error('Stack trace:', (error as Error).stack);
    throw error;
  }
};
