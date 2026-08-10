import { computeRemoteArrowGlidePath } from "@/game/glide";
import type { CellType, Position } from "@/game/types";
import { applyPlayerMoveAtomic, applyRemoteArrowMoveAtomic, applyTeleportCycleAtomic } from "./actions";
import { buildBaseGrid, cloneGrid } from "./utils";
import type { Action, DirKey, SolveState } from "./state";
import { DIR_VECTORS } from "./state";

export function parseActionString(raw: string): Action | null {
  if (raw === "T") return { t: "T" };
  const pMatch = raw.match(/^P:([URDL])$/);
  if (pMatch) return { t: "P", d: pMatch[1] as DirKey };
  const aMatch = raw.match(/^A\((\d+),(\d+)\):([URDL])$/);
  if (aMatch) return { t: "A", x: Number(aMatch[1]), y: Number(aMatch[2]), d: aMatch[3] as DirKey };
  return null;
}

function fmtAction(a: Action): string {
  if (a.t === "P") return `P:${a.d}`;
  if (a.t === "T") return `T`;
  return `A(${a.x},${a.y}):${a.d}`;
}

const DIR_LABELS: Record<DirKey, string> = {
  U: "Up",
  R: "Right",
  D: "Down",
  L: "Left",
};

export interface SolutionFrame {
  step: number;
  label: string;
  grid: CellType[][];
  playerPos: Position;
  arrowFrom?: Position;
  arrowTo?: Position;
}

export function replaySolutionActions(
  grid: CellType[][],
  playerStart: Position,
  actionStrings: string[],
): SolutionFrame[] {
  let state: SolveState = {
    grid: grid.map((r) => r.slice()) as CellType[][],
    baseGrid: buildBaseGrid(grid.map((r) => r.slice()) as CellType[][]),
    playerPos: { ...playerStart },
    inventory: { red: 0, green: 0 },
    breakableRockStates: new Map(),
  };

  const frames: SolutionFrame[] = [
    { step: 0, label: "Start", grid: state.grid, playerPos: state.playerPos },
  ];

  actionStrings.forEach((raw, i) => {
    const action = parseActionString(raw);
    if (!action) return;

    let next: SolveState | null = null;
    let label = raw;
    let arrowFrom: Position | undefined;
    let arrowTo: Position | undefined;

    if (action.t === "P") {
      const v = DIR_VECTORS[action.d];
      const result = applyPlayerMoveAtomic(state, v.dx, v.dy);
      if (!result.ok) return;
      next = result.state!;
      label = `Move ${DIR_LABELS[action.d]}`;
    } else if (action.t === "A") {
      const v = DIR_VECTORS[action.d];
      arrowFrom = { x: action.x, y: action.y };
      const arrowCell = state.grid[action.y]?.[action.x] as CellType | undefined;
      if (arrowCell !== undefined) {
        const preview = computeRemoteArrowGlidePath(state.grid, arrowFrom, v.dx, v.dy, arrowCell);
        if (preview.path.length > 0) arrowTo = preview.path[preview.path.length - 1];
      }
      const result = applyRemoteArrowMoveAtomic(state, arrowFrom, v.dx, v.dy);
      if (!result.ok) return;
      next = result.state!;
      label = `Slide arrow (${action.x}, ${action.y}) ${DIR_LABELS[action.d]}`;
    } else if (action.t === "T") {
      const result = applyTeleportCycleAtomic(state);
      if (!result.ok) return;
      next = result.state!;
      label = "Wait for teleport";
    }

    if (!next) return;
    state = next;
    frames.push({ step: i + 1, label, grid: state.grid, playerPos: state.playerPos, arrowFrom, arrowTo });
  });

  return frames;
}
