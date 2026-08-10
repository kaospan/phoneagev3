import type { CellType, Position } from "@/game/types";
import { solveGrid } from "@/lib/levelSolver";

export type LevelLabDifficulty = "easy" | "medium" | "hard" | "expert";

export interface LevelLabMechanics {
  keys: boolean;
  arrows: boolean;
  teleports: boolean;
}

export interface LevelLabCandidate {
  id: string;
  createdAt: string;
  seed: number;
  difficulty: LevelLabDifficulty;
  mechanics: LevelLabMechanics;
  grid: CellType[][];
  playerStart: Position;
  cavePos: Position;
  solved: boolean;
  moves: number | null;
  actions: string[];
  reason: string;
  nodesExpanded: number;
  ms: number;
  score: number;
  promotedLevelId?: number;
}

export interface GenerateLevelLabCandidateOptions {
  seed: number;
  difficulty: LevelLabDifficulty;
  mechanics: LevelLabMechanics;
}

export interface GenerateLevelLabCampaignOptions {
  seed: number;
  candidateCount?: number;
  levelsToPromote?: number;
  onProgress?: (done: number, total: number, selected: number) => void;
  shouldCancel?: () => boolean;
}

export interface LevelLabCampaignResult {
  generated: LevelLabCandidate[];
  promoted: LevelLabCandidate[];
  attempted: number;
}

const ROWS = 11;
const COLS = 20;

const PROMOTED_LEVEL_START = 101;
const PROMOTED_LEVEL_END = 200;

const levelLabDifficultyRanges: Record<LevelLabDifficulty, { start: number; end: number }> = {
  easy: { start: 101, end: 125 },
  medium: { start: 126, end: 150 },
  hard: { start: 151, end: 175 },
  expert: { start: 176, end: 200 },
};

const difficultyOrder: LevelLabDifficulty[] = ["easy", "medium", "hard", "expert"];

const difficultyConfig: Record<LevelLabDifficulty, {
  wander: number;
  obstacleChance: number;
  solveMs: number;
  solveNodes: number;
  maxDepth: number;
  targetMoves: number;
}> = {
  easy: { wander: 0.28, obstacleChance: 0.14, solveMs: 1500, solveNodes: 12000, maxDepth: 100, targetMoves: 14 },
  medium: { wander: 0.45, obstacleChance: 0.22, solveMs: 2200, solveNodes: 25000, maxDepth: 150, targetMoves: 24 },
  hard: { wander: 0.60, obstacleChance: 0.32, solveMs: 3200, solveNodes: 50000, maxDepth: 210, targetMoves: 38 },
  expert: { wander: 0.75, obstacleChance: 0.42, solveMs: 5000, solveNodes: 90000, maxDepth: 300, targetMoves: 55 },
};

export const levelLabDifficultyForPromotedIndex = (
  index: number,
  totalPromoted = PROMOTED_LEVEL_END - PROMOTED_LEVEL_START + 1,
): LevelLabDifficulty => {
  const total = Math.max(1, totalPromoted);
  const clampedIndex = Math.max(0, Math.min(total - 1, index));
  const ratio = clampedIndex / total;
  if (ratio < 0.25) return "easy";
  if (ratio < 0.5) return "medium";
  if (ratio < 0.75) return "hard";
  return "expert";
};

export const levelLabDifficultyForPromotedLevelId = (levelId: number): LevelLabDifficulty | null => {
  for (const difficulty of difficultyOrder) {
    const { start, end } = levelLabDifficultyRanges[difficulty];
    if (levelId >= start && levelId <= end) return difficulty;
  }
  return null;
};

export const buildLevelLabPromotionSlots = (levelsToPromote: number): Array<{ levelId: number; difficulty: LevelLabDifficulty }> => {
  const total = Math.max(0, levelsToPromote);

  // Explicitly pin the 100-level campaign to fixed mapper overwrite bands.
  if (total === 100) {
    const slots: Array<{ levelId: number; difficulty: LevelLabDifficulty }> = [];
    for (const difficulty of difficultyOrder) {
      const { start, end } = levelLabDifficultyRanges[difficulty];
      for (let levelId = start; levelId <= end; levelId += 1) {
        slots.push({ levelId, difficulty });
      }
    }
    return slots;
  }

  return Array.from({ length: total }, (_, index) => ({
    levelId: PROMOTED_LEVEL_START + index,
    difficulty: levelLabDifficultyForPromotedIndex(index, total),
  }));
};

export const levelLabMechanicsForDifficulty = (difficulty: LevelLabDifficulty): LevelLabMechanics => {
  if (difficulty === "easy") return { keys: false, arrows: true, teleports: false };
  if (difficulty === "medium") return { keys: true, arrows: true, teleports: false };
  if (difficulty === "hard") return { keys: true, arrows: true, teleports: true };
  return { keys: true, arrows: true, teleports: true };
};

const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const randomInt = (rng: () => number, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

const keyFor = (p: Position) => `${p.x},${p.y}`;

export const fingerprintLevelLabGrid = (grid: CellType[][]): string =>
  grid.map((row) => row.join(",")).join("|");

const buildPath = (rng: () => number, difficulty: LevelLabDifficulty): Position[] => {
  const config = difficultyConfig[difficulty];
  const startY = randomInt(rng, 2, ROWS - 2);
  const goalY = randomInt(rng, 2, ROWS - 2);
  const path: Position[] = [{ x: 1, y: startY }];
  const visited = new Set([keyFor(path[0])]);
  let current = path[0];
  let guard = 0;

  while ((current.x !== COLS - 2 || current.y !== goalY) && guard < 400) {
    guard += 1;

    const right = { x: current.x + 1, y: current.y };
    const down = { x: current.x, y: current.y + 1 };
    const up = { x: current.x, y: current.y - 1 };

    const canRight = right.x < COLS - 1 && !visited.has(keyFor(right));
    const canDown = down.y < ROWS - 1 && !visited.has(keyFor(down));
    const canUp = up.y > 0 && !visited.has(keyFor(up));

    if (!canRight && !canDown && !canUp) break;

    const rightProbability = Math.max(0.35, 0.75 - config.wander * 0.5);
    const roll = rng();
    let next: Position;
    if (canRight && roll < rightProbability) {
      next = right;
    } else if (canDown && canUp) {
      next = rng() < 0.5 ? down : up;
    } else if (canDown) {
      next = down;
    } else if (canUp) {
      next = up;
    } else {
      next = right;
    }

    current = next;
    path.push(current);
    visited.add(keyFor(current));
  }

  return path;
};

const randomArrowCell = (rng: () => number): CellType => {
  const roll = rng();
  if (roll < 0.22) return 7;
  if (roll < 0.44) return 8;
  if (roll < 0.66) return 9;
  if (roll < 0.80) return 10;
  if (roll < 0.88) return 11;
  if (roll < 0.95) return 12;
  return 13;
};

const carveCandidateGrid = (
  rng: () => number,
  path: Position[],
  difficulty: LevelLabDifficulty,
  mechanics: LevelLabMechanics,
): CellType[][] => {
  const config = difficultyConfig[difficulty];
  const grid = Array.from({ length: ROWS }, () => Array<CellType>(COLS).fill(5));
  const pathKeys = new Set(path.map(keyFor));

  for (const p of path) grid[p.y][p.x] = 0;

  for (const p of path) {
    const neighbors = [
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x, y: p.y - 1 },
    ];
    for (const n of neighbors) {
      if (n.x <= 0 || n.x >= COLS - 1 || n.y <= 0 || n.y >= ROWS - 1 || pathKeys.has(keyFor(n))) continue;
      if (rng() < 0.40) grid[n.y][n.x] = 0;
    }
  }

  for (let y = 1; y < ROWS - 1; y += 1) {
    for (let x = 1; x < COLS - 1; x += 1) {
      if (pathKeys.has(`${x},${y}`) || grid[y][x] !== 0) continue;
      if (rng() < config.obstacleChance) {
        const roll = rng();
        if (roll < 0.55) grid[y][x] = 2;
        else if (roll < 0.80) grid[y][x] = 1;
        else if (roll < 0.92) grid[y][x] = 4;
        else grid[y][x] = 6;
      }
    }
  }

  const start = path[0];
  const cave = path[path.length - 1];
  grid[start.y][start.x] = 18;
  grid[cave.y][cave.x] = 3;

  const usablePath = path.slice(2, -2);
  if (mechanics.keys && usablePath.length >= 8) {
    const redKeyIndex = Math.max(1, Math.floor(usablePath.length * 0.24));
    const redLockIndex = Math.max(redKeyIndex + 2, Math.floor(usablePath.length * 0.62));
    const redKey = usablePath[redKeyIndex];
    const redLock = usablePath[Math.min(usablePath.length - 1, redLockIndex)];
    grid[redKey.y][redKey.x] = 14;
    grid[redLock.y][redLock.x] = 16;

    if ((difficulty === "hard" || difficulty === "expert") && usablePath.length >= 14) {
      const greenKey = usablePath[Math.floor(usablePath.length * 0.42)];
      const greenLock = usablePath[Math.floor(usablePath.length * 0.78)];
      if (grid[greenKey.y][greenKey.x] === 0) grid[greenKey.y][greenKey.x] = 15;
      if (grid[greenLock.y][greenLock.x] === 0) grid[greenLock.y][greenLock.x] = 17;
    }
  }

  if (mechanics.arrows && usablePath.length >= 4) {
    const count = difficulty === "easy" ? 2 : difficulty === "medium" ? 4 : difficulty === "hard" ? 6 : 8;
    for (let i = 0; i < count; i += 1) {
      let px: number, py: number;
      if (rng() < 0.55 && path.length > 4) {
        const idx = randomInt(rng, 1, path.length - 2);
        px = path[idx].x;
        py = path[idx].y;
      } else {
        const candidates: Position[] = [];
        for (let y = 1; y < ROWS - 1; y++) {
          for (let x = 1; x < COLS - 1; x++) {
            if (grid[y][x] === 0 && !pathKeys.has(`${x},${y}`)) {
              candidates.push({ x, y });
            }
          }
        }
        if (candidates.length === 0) continue;
        const pick = candidates[Math.floor(rng() * candidates.length)];
        px = pick.x;
        py = pick.y;
      }

      if (grid[py][px] !== 0) continue;
      grid[py][px] = randomArrowCell(rng);
    }
  }

  if (mechanics.teleports && usablePath.length >= 10) {
    const first = usablePath[Math.floor(usablePath.length * 0.34)];
    const second = usablePath[Math.floor(usablePath.length * 0.70)];
    if (grid[first.y][first.x] === 0 && grid[second.y][second.x] === 0) {
      grid[first.y][first.x] = 19;
      grid[second.y][second.x] = 19;
    }
  }

  return grid;
};

export const scoreLevelLabCandidate = (
  difficulty: LevelLabDifficulty,
  mechanics: LevelLabMechanics,
  moves: number | null,
  nodesExpanded: number,
) => {
  if (!moves) return 0;
  const targetMoves = difficultyConfig[difficulty].targetMoves;
  const mechanicCount = Number(mechanics.keys) + Number(mechanics.arrows) + Number(mechanics.teleports);
  const moveScore = Math.max(0, 100 - Math.abs(targetMoves - moves) * 2.8);
  const searchScore = Math.min(35, Math.log10(Math.max(1, nodesExpanded)) * 9);
  return Math.round(moveScore + mechanicCount * 12 + searchScore);
};

export const generateLevelLabCandidate = async ({
  seed,
  difficulty,
  mechanics,
}: GenerateLevelLabCandidateOptions): Promise<LevelLabCandidate> => {
  const rng = createRng(seed);
  const path = buildPath(rng, difficulty);
  const grid = carveCandidateGrid(rng, path, difficulty, mechanics);
  const playerStart = { ...path[0] };
  const cavePos = { ...path[path.length - 1] };
  const result = await solveGrid(grid, playerStart, cavePos, {
    maxMsPerLevel: difficultyConfig[difficulty].solveMs,
    maxNodesPerLevel: difficultyConfig[difficulty].solveNodes,
    maxDepth: difficultyConfig[difficulty].maxDepth,
  });
  const score = scoreLevelLabCandidate(difficulty, mechanics, result.moves, result.nodesExpanded);

  return {
    id: `lab-${seed}`,
    createdAt: new Date().toISOString(),
    seed,
    difficulty,
    mechanics: { ...mechanics },
    grid,
    playerStart,
    cavePos,
    solved: result.solved,
    moves: result.moves,
    actions: result.actions,
    reason: result.reason ?? (result.solved ? "Solved" : "Unknown solver result"),
    nodesExpanded: result.nodesExpanded,
    ms: result.ms,
    score,
  };
};

export const generateLevelLabCampaign = async ({
  seed,
  candidateCount = 1000,
  levelsToPromote = 100,
  onProgress,
  shouldCancel,
}: GenerateLevelLabCampaignOptions): Promise<LevelLabCampaignResult> => {
  const generated: LevelLabCandidate[] = [];
  const promotionSlots = buildLevelLabPromotionSlots(levelsToPromote);
  const selectedByDifficulty: Record<LevelLabDifficulty, LevelLabCandidate[]> = {
    easy: [],
    medium: [],
    hard: [],
    expert: [],
  };
  const seen = new Set<string>();
  const perBandTarget = Math.ceil(Math.max(0, levelsToPromote) / 4);

  for (let i = 0; i < candidateCount; i += 1) {
    if (shouldCancel?.()) break;
    const targetIndex = Math.min(
      promotionSlots.length - 1,
      Math.floor((i / Math.max(1, candidateCount)) * Math.max(1, promotionSlots.length)),
    );
    const difficulty = promotionSlots[Math.max(0, targetIndex)]?.difficulty ?? "expert";
    const mechanics = levelLabMechanicsForDifficulty(difficulty);
    const candidate = await generateLevelLabCandidate({
      seed: seed + i * 104729,
      difficulty,
      mechanics,
    });
    const fingerprint = fingerprintLevelLabGrid(candidate.grid);
    const unique = !seen.has(fingerprint);
    seen.add(fingerprint);
    generated.push(candidate);

    if (candidate.solved && unique) {
      const bucket = selectedByDifficulty[difficulty];
      bucket.push(candidate);
      bucket.sort((a, b) => b.score - a.score || (b.moves ?? 0) - (a.moves ?? 0));
      selectedByDifficulty[difficulty] = bucket.slice(0, perBandTarget + 10);
    }

    onProgress?.(i + 1, candidateCount, Object.values(selectedByDifficulty).reduce((sum, bucket) => sum + bucket.length, 0));
  }

  const promotedByLevelId = new Map<number, LevelLabCandidate>();
  const usedCandidateIds = new Set<string>();

  // First pass: assign best bucketed candidates into their exact slot difficulty.
  for (const slot of promotionSlots) {
    const bucket = selectedByDifficulty[slot.difficulty];
    const picked = bucket.shift();
    if (!picked || usedCandidateIds.has(picked.id)) continue;
    promotedByLevelId.set(slot.levelId, { ...picked, promotedLevelId: slot.levelId });
    usedCandidateIds.add(picked.id);
  }

  // Fallback pass: fill missing slots using remaining solved candidates of the same difficulty only.
  const fallbackByDifficulty: Record<LevelLabDifficulty, LevelLabCandidate[]> = {
    easy: generated
      .filter((candidate) => candidate.solved && candidate.difficulty === "easy")
      .sort((a, b) => b.score - a.score),
    medium: generated
      .filter((candidate) => candidate.solved && candidate.difficulty === "medium")
      .sort((a, b) => b.score - a.score),
    hard: generated
      .filter((candidate) => candidate.solved && candidate.difficulty === "hard")
      .sort((a, b) => b.score - a.score),
    expert: generated
      .filter((candidate) => candidate.solved && candidate.difficulty === "expert")
      .sort((a, b) => b.score - a.score),
  };

  for (const slot of promotionSlots) {
    if (promotedByLevelId.has(slot.levelId)) continue;
    const fallbackBucket = fallbackByDifficulty[slot.difficulty];
    const picked = fallbackBucket.find((candidate) => !usedCandidateIds.has(candidate.id));
    if (!picked) continue;
    promotedByLevelId.set(slot.levelId, { ...picked, promotedLevelId: slot.levelId });
    usedCandidateIds.add(picked.id);
  }

  const promoted = promotionSlots
    .map((slot) => promotedByLevelId.get(slot.levelId))
    .filter((candidate): candidate is LevelLabCandidate => Boolean(candidate));

  return {
    generated,
    promoted,
    attempted: generated.length,
  };
};
