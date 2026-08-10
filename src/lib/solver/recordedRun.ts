import { getArrowDirections, isArrowCell } from "@/game/arrows";
import { computeRemoteArrowGlidePath } from "@/game/glide";
import type { CellType, Position } from "@/game/types";
import type { RecordedInputCommand } from "@/lib/moveRecording";
import { applyPlayerMoveAtomic, applyRemoteArrowMoveAtomic, applyTeleportCycleAtomic } from "./actions";
import { DIR_VECTORS, type DirKey, type SolveState } from "./state";

const dirKeyFromDelta = (dx: number, dy: number): DirKey | null => {
  if (dx === 0 && dy === -1) return "U";
  if (dx === 1 && dy === 0) return "R";
  if (dx === 0 && dy === 1) return "D";
  if (dx === -1 && dy === 0) return "L";
  return null;
};

const remoteArrowCanMove = (state: SolveState, pos: Position): boolean => {
  const cell = state.grid[pos.y]?.[pos.x] as CellType | undefined;
  if (cell === undefined || !isArrowCell(cell)) return false;
  return getArrowDirections(cell).some((dir) => {
    const path = computeRemoteArrowGlidePath(state.grid, pos, dir.dx, dir.dy, cell);
    return path.path.length > 0;
  });
};

export interface RecordedRunReplayResult {
  solved: boolean;
  actions: string[];
  finalState: SolveState;
}

export const replayRecordedInputsAsSolverActions = (
  start: SolveState,
  goalCaves: Position[],
  recordedInputs: RecordedInputCommand[],
): RecordedRunReplayResult => {
  const goalKeys = new Set(goalCaves.map((goal) => `${goal.x},${goal.y}`));
  let state = start;
  let selectedArrow: Position | null = null;
  const actions: string[] = [];

  for (const input of recordedInputs) {
    if (input.type === "select") {
      if (state.playerPos.x === input.x && state.playerPos.y === input.y) continue;
      const cell = state.grid[input.y]?.[input.x] as CellType | undefined;
      selectedArrow = cell !== undefined && isArrowCell(cell) ? { x: input.x, y: input.y } : selectedArrow;
      continue;
    }

    if (input.type === "deselect") {
      selectedArrow = null;
      continue;
    }

    if (input.type === "wait") {
      const result = applyTeleportCycleAtomic(state);
      if (!result.ok || !result.state) continue;
      actions.push("T");
      state = result.state;
      selectedArrow = null;
      continue;
    }

    const dir = dirKeyFromDelta(input.dx, input.dy);
    if (!dir) continue;
    const vector = DIR_VECTORS[dir];

    if (selectedArrow) {
      const arrowCell = state.grid[selectedArrow.y]?.[selectedArrow.x] as CellType | undefined;
      if (arrowCell === undefined) {
        selectedArrow = null;
        continue;
      }
      const glide = computeRemoteArrowGlidePath(state.grid, selectedArrow, vector.dx, vector.dy, arrowCell);
      const result = applyRemoteArrowMoveAtomic(state, selectedArrow, vector.dx, vector.dy);
      if (!result.ok || !result.state || glide.path.length === 0) continue;

      actions.push(`A(${selectedArrow.x},${selectedArrow.y}):${dir}`);
      state = result.state;
      const newArrowPos = glide.path[glide.path.length - 1];
      selectedArrow = remoteArrowCanMove(state, newArrowPos) ? { ...newArrowPos } : null;
      continue;
    }

    const result = applyPlayerMoveAtomic(state, vector.dx, vector.dy);
    if (!result.ok || !result.state) continue;
    actions.push(`P:${dir}`);
    state = result.state;
  }

  return {
    solved: goalKeys.has(`${state.playerPos.x},${state.playerPos.y}`),
    actions,
    finalState: state,
  };
};
