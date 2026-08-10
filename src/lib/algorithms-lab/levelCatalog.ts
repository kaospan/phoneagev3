import { getAllLevels, isPlaceholderGrid, type Level } from "@/data/levels";
import { findGoalCaves } from "@/game/caves";
import type { CellType, Position } from "@/game/types";
import { manhattanToGoal } from "@/lib/solver/heuristics";
import type { SolveState } from "@/lib/solver/state";
import { buildBaseGrid, cloneGrid } from "@/lib/solver/utils";

export type DifficultyTier = "beginner" | "easy" | "medium" | "hard" | "expert";

export const DIFFICULTY_TIERS: DifficultyTier[] = ["beginner", "easy", "medium", "hard", "expert"];

export const DIFFICULTY_TIER_LABELS: Record<DifficultyTier, string> = {
  beginner: "Beginner",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

export interface LabLevelSummary {
  id: number;
  grid: number[][];
  playerStart: Position;
  cavePos: Position;
  tier: DifficultyTier;
  score: number;
  highlighted?: "bfs-explosion" | "known-hard";
  highlightNote?: string;
}

/**
 * Levels flagged regardless of where their structural score lands them, because
 * they're independently known-interesting from production solver testing (see
 * src/lib/solver/level8.test.ts and level_solutions.txt).
 */
const HIGHLIGHTS: Record<number, { highlighted: LabLevelSummary["highlighted"]; note: string }> = {
  8: {
    highlighted: "bfs-explosion",
    note: "Production BFS expands roughly 73,000 states here before it's cut off — the flagship example for \"why did BFS explore so much?\"",
  },
  12: {
    highlighted: "known-hard",
    note: "Stays unsolved within typical search budgets in production testing — a good second data point once you've explored level 8.",
  },
};

const isArrowCellValue = (cell: number) => cell >= 7 && cell <= 13;
const isKeyOrLockCellValue = (cell: number) => cell >= 14 && cell <= 17;

/**
 * A cheap, no-solving structural proxy for search difficulty: bigger grids and more
 * interactive elements (arrows, keys/locks, teleports, breakable rocks) roughly
 * multiply the reachable state space, which is what actually drives search cost.
 * This is intentionally NOT measured search cost (no solver run happens here) — see
 * AlgorithmsLab plan notes for why no precomputed per-level solver stats exist to
 * use instead. Levels 8/12 are hardcoded into HIGHLIGHTS above so the one level we
 * do have real measurements for is always easy to find regardless of its bucket.
 */
function computeStructuralScore(level: Level): number {
  const grid = level.grid;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const area = rows * cols;

  let arrows = 0;
  let keysAndLocks = 0;
  let teleports = 0;
  let breakables = 0;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cell = grid[y][x];
      if (isArrowCellValue(cell)) arrows += 1;
      else if (isKeyOrLockCellValue(cell)) keysAndLocks += 1;
      else if (cell === 19) teleports += 1;
      else if (cell === 6) breakables += 1;
    }
  }

  const goals = findGoalCaves(grid, level.cavePos);
  const startDistance = goals.length > 0 ? manhattanToGoal(level.playerStart, goals) : 0;

  // Weighted composite — interactive elements dominate because each one roughly
  // multiplies (not adds to) the reachable state space, unlike plain floor area.
  return area * 0.05 + arrows * 6 + keysAndLocks * 8 + teleports * 5 + breakables * 4 + startDistance * 0.5;
}

let cache: LabLevelSummary[] | null = null;

export type LevelRange = "all" | "1-100" | "101-200";
export type SolvedFilter = "all" | "solved" | "unsolved";

export interface LevelPickerFilters {
  range: LevelRange;
  sortBy: "default" | "number";
  solvedFilter: SolvedFilter;
}

export function applyLevelFilters(
  levels: LabLevelSummary[],
  filters: LevelPickerFilters,
  solvedIds: Set<number>,
): LabLevelSummary[] {
  let result = levels;

  if (filters.range === "1-100") {
    result = result.filter((l) => l.id >= 1 && l.id <= 100);
  } else if (filters.range === "101-200") {
    result = result.filter((l) => l.id >= 101 && l.id <= 200);
  }

  if (filters.solvedFilter === "solved") {
    result = result.filter((l) => solvedIds.has(l.id));
  } else if (filters.solvedFilter === "unsolved") {
    result = result.filter((l) => !solvedIds.has(l.id));
  }

  if (filters.sortBy === "number") {
    result = [...result].sort((a, b) => a.id - b.id);
  }

  return result;
}

export const SOLVED_LEVELS_STORAGE_KEY = "algo-lab-solved-levels";

export function loadSolvedLevels(): Set<number> {
  try {
    const raw = localStorage.getItem(SOLVED_LEVELS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as number[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

export function persistSolvedLevels(ids: Set<number>): void {
  try {
    localStorage.setItem(SOLVED_LEVELS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // silently ignore storage failures
  }
}

/** Lazily computed once per session; getAllLevels() itself is cheap (~200 levels, no solving). */
export function getLabLevels(): LabLevelSummary[] {
  if (cache) return cache;

  const real = getAllLevels().filter((level) => !isPlaceholderGrid(level.grid));
  const scored = real
    .map((level) => ({ level, score: computeStructuralScore(level) }))
    .sort((a, b) => a.score - b.score);

  const n = scored.length;
  cache = scored.map(({ level, score }, index) => {
    const quantile = n <= 1 ? 0 : index / (n - 1);
    const tierIndex = Math.min(DIFFICULTY_TIERS.length - 1, Math.floor(quantile * DIFFICULTY_TIERS.length));
    const highlight = HIGHLIGHTS[level.id];
    return {
      id: level.id,
      grid: level.grid,
      playerStart: level.playerStart,
      cavePos: level.cavePos,
      tier: DIFFICULTY_TIERS[tierIndex],
      score,
      ...(highlight ? { highlighted: highlight.highlighted, highlightNote: highlight.note } : {}),
    };
  });

  return cache;
}

export function getLabLevelsByTier(tier: DifficultyTier): LabLevelSummary[] {
  return getLabLevels().filter((level) => level.tier === tier);
}

export function getLabLevel(id: number): LabLevelSummary | undefined {
  return getLabLevels().find((level) => level.id === id);
}

/** Builds the same shape of initial SolveState that src/lib/solver/api.ts's solveGrid uses. */
export function buildSearchInputs(levelSummary: Pick<LabLevelSummary, "grid" | "playerStart" | "cavePos">): {
  start: SolveState;
  goalCaves: Position[];
} {
  const grid = cloneGrid(levelSummary.grid as CellType[][]);
  const start: SolveState = {
    grid,
    baseGrid: buildBaseGrid(cloneGrid(grid)),
    playerPos: { ...levelSummary.playerStart },
    inventory: { red: 0, green: 0 },
    breakableRockStates: new Map(),
  };
  const goalCaves = findGoalCaves(grid, levelSummary.cavePos);
  return { start, goalCaves };
}
