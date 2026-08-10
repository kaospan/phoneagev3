import { getAllLevels, isPlaceholderGrid } from "@/data/levels";
import { findGoalCaves } from "@/game/caves";
import type { CellType, KeyInventory, Position } from "@/game/types";
import { getRecordedRun } from "@/lib/moveRecording";
import { solveLevel } from "./solver";
import { buildBaseGrid, cloneGrid } from "./utils";
import { replayRecordedInputsAsSolverActions } from "./recordedRun";
import type { LevelSolution, LevelDump, SolveGridInitialState, SolveOptions } from "./types";
import type { SolveState } from "./state";

export async function runSolveLevel(levelId: number, options: SolveOptions = {}): Promise<LevelSolution> {
  const levels = getAllLevels();
  const lvl = levels.find((l) => l.id === levelId);
  if (!lvl) {
    return {
      levelId,
      solved: false,
      moves: null,
      actions: [],
      reason: "Level not found",
      nodesExpanded: 0,
      ms: 0,
    };
  }
  return solveGrid(lvl.grid as CellType[][], lvl.playerStart, lvl.cavePos, options, levelId);
}

export async function runSolveAllLevels(options: SolveOptions = {}): Promise<{
  generatedAt: string;
  options: Required<Pick<SolveOptions, "maxMsPerLevel" | "maxNodesPerLevel" | "maxDepth">>;
  results: LevelSolution[];
  text: string;
}> {
  const formatLocalIso = (d: Date) => {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const pad3 = (n: number) => String(n).padStart(3, "0");
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    const ss = pad2(d.getSeconds());
    const ms = pad3(d.getMilliseconds());
    const offMin = -d.getTimezoneOffset();
    const sign = offMin >= 0 ? "+" : "-";
    const abs = Math.abs(offMin);
    const offH = pad2(Math.floor(abs / 60));
    const offM = pad2(abs % 60);
    return `${y}-${m}-${day}T${hh}:${mm}:${ss}.${ms}${sign}${offH}:${offM}`;
  };

  const opts = {
    maxMsPerLevel: options.maxMsPerLevel ?? 4000,
    maxNodesPerLevel: options.maxNodesPerLevel ?? 40_000,
    maxDepth: options.maxDepth ?? 200,
  };
  const onProgress = options.onProgress;

  const levels = getAllLevels();
  const results: LevelSolution[] = [];
  const lines: string[] = [];
  lines.push(`# Level Solutions (Minimum Moves)`);
  lines.push(`Generated: ${formatLocalIso(new Date())}`);
  lines.push(`Limits: maxMsPerLevel=${opts.maxMsPerLevel}, maxNodesPerLevel=${opts.maxNodesPerLevel}, maxDepth=${opts.maxDepth}`);
  lines.push("");

  for (const lvl of levels) {
    const grid = lvl.grid as CellType[][];
    if (isPlaceholderGrid(grid)) {
      results.push({
        levelId: lvl.id,
        solved: false,
        moves: null,
        actions: [],
        reason: "Placeholder/empty grid",
        nodesExpanded: 0,
        ms: 0,
      });
      continue;
    }

    const goalCaves = findGoalCaves(grid, lvl.cavePos);
    if (goalCaves.length === 0) {
      results.push({
        levelId: lvl.id,
        solved: false,
        moves: null,
        actions: [],
        reason: "Missing goal cave tile",
        nodesExpanded: 0,
        ms: 0,
      });
      continue;
    }

    if (onProgress) onProgress(`Solving level ${lvl.id}...`);

    const start: SolveState = {
      grid: grid.map((r) => r.slice()) as CellType[][],
      baseGrid: buildBaseGrid(grid.map((r) => r.slice()) as CellType[][]),
      playerPos: { ...lvl.playerStart },
      inventory: { red: 0, green: 0 },
      breakableRockStates: new Map(),
    };

    const solved = await solveLevel(lvl.id, start, goalCaves, { ...opts, onProgress });
    results.push(solved);

    if (solved.solved) {
      lines.push(`Level ${lvl.id}: ${solved.moves} moves (expanded ${solved.nodesExpanded}, ${solved.ms}ms)`);
      lines.push(solved.actions.join(" "));
      lines.push("");
    } else {
      lines.push(`Level ${lvl.id}: UNSOLVED (${solved.reason ?? "unknown"})`);
      lines.push("");
    }
  }

  const text = lines.join("\n");
  return {
    generatedAt: formatLocalIso(new Date()),
    options: opts,
    results,
    text,
  };
}

export function dumpLevel(levelId: number): LevelDump | null {
  const levels = getAllLevels();
  const lvl = levels.find((l) => l.id === levelId);
  if (!lvl) return null;
  const grid = (lvl.grid ?? []).map((r) => r.slice());
  let arrowCount = 0;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < (grid[y]?.length ?? 0); x++) {
      const v = grid[y][x] as CellType;
      if ((v >= 7 && v <= 13)) arrowCount += 1;
    }
  }
  return {
    levelId,
    grid,
    playerStart: { ...lvl.playerStart },
    cavePos: { ...lvl.cavePos },
    theme: lvl.theme,
    arrowCount,
  };
}

export async function solveGrid(
  grid: CellType[][],
  playerStart: Position,
  cavePos: Position,
  options: SolveOptions = {},
  levelId = 0,
  initialState?: SolveGridInitialState,
): Promise<LevelSolution> {
  if (isPlaceholderGrid(grid)) {
    return {
      levelId,
      solved: false,
      moves: null,
      actions: [],
      reason: "Placeholder/empty grid",
      nodesExpanded: 0,
      ms: 0,
    };
  }
  const goalCaves = findGoalCaves(grid, cavePos);
  if (goalCaves.length === 0) {
    return {
      levelId,
      solved: false,
      moves: null,
      actions: [],
      reason: "Missing goal cave tile",
      nodesExpanded: 0,
      ms: 0,
    };
  }

  const start: SolveState = {
    grid: grid.map((r) => r.slice()) as CellType[][],
    baseGrid: buildBaseGrid(grid.map((r) => r.slice()) as CellType[][]),
    playerPos: { ...playerStart },
    inventory: initialState?.inventory ? { ...initialState.inventory } : { red: 0, green: 0 },
    breakableRockStates: initialState?.breakableRockStates
      ? new Map(initialState.breakableRockStates)
      : new Map(),
  };
  const result = await solveLevel(levelId, start, goalCaves, {
    maxMsPerLevel: options.maxMsPerLevel ?? 15000,
    maxNodesPerLevel: options.maxNodesPerLevel ?? 200_000,
    maxDepth: options.maxDepth ?? 300,
    onProgress: options.onProgress,
    trace: options.trace,
  });

  if (result.solved || levelId <= 0) return result;

  const recordedRun = getRecordedRun(levelId);
  if (!recordedRun) return result;

  const learned = replayRecordedInputsAsSolverActions(start, goalCaves, recordedRun.actions);
  if (!learned.solved) return result;

  return {
    levelId,
    solved: true,
    moves: learned.actions.length,
    actions: learned.actions,
    reason: "Learned from recorded run after bounded search failed",
    nodesExpanded: result.nodesExpanded,
    ms: result.ms,
    trace: result.trace,
  };
}
