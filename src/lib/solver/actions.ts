import { getArrowDirections, isArrowCell } from "@/game/arrows";
import { computePlayerGlidePath, computeRemoteArrowGlidePath } from "@/game/glide";
import { getNextTeleport, TELEPORT_CELL } from "@/game/teleport";
import type { CellType, KeyInventory, Position } from "@/game/types";
import { cloneBreakables, cloneGrid, cloneInventory } from "./utils";
import { DIR_LABELS, DIR_VECTORS, DIRS, SolveState, stateKey } from "./state";
import type { Action, DirKey } from "./state";
import { manhattanToGoal } from "./heuristics";

const isKeyCell = (cell: CellType) => cell === 14 || cell === 15;
const isLockCell = (cell: CellType) => cell === 16 || cell === 17;
const keyColorForCell = (cell: CellType): keyof KeyInventory | null =>
  cell === 14 ? "red" : cell === 15 ? "green" : null;
const lockColorForCell = (cell: CellType): keyof KeyInventory | null =>
  cell === 16 ? "red" : cell === 17 ? "green" : null;
const isHourglassCell = (cell: CellType) => cell === 20;

export interface ActionResult {
  ok: boolean;
  state?: SolveState;
  reason?: string;
}

export function applyPlayerMoveAtomic(prev: SolveState, dx: number, dy: number): ActionResult {
  const grid = prev.grid;
  const baseGrid = prev.baseGrid;
  const inv = prev.inventory;
  const br = prev.breakableRockStates;
  const px = prev.playerPos.x;
  const py = prev.playerPos.y;
  const tx = px + dx;
  const ty = py + dy;
  if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length) {
    return { ok: false, reason: "Out of bounds" };
  }

  const playerCell = grid[py][px] as CellType;
  const targetCell = grid[ty][tx] as CellType;
  const targetKey = keyColorForCell(targetCell);
  const targetLock = lockColorForCell(targetCell);
  const targetHourglass = isHourglassCell(targetCell);

  const next: SolveState = {
    grid,
    baseGrid,
    playerPos: { x: px, y: py },
    inventory: inv,
    breakableRockStates: br,
  };

  const ensureCloned = () => {
    if (next.grid === grid) next.grid = cloneGrid(grid);
    if (next.baseGrid === baseGrid) next.baseGrid = cloneGrid(baseGrid);
    if (next.inventory === inv) next.inventory = cloneInventory(inv);
    if (next.breakableRockStates === br) next.breakableRockStates = cloneBreakables(br);
  };

  if (isArrowCell(playerCell)) {
    if (targetLock && Math.max(0, Math.floor(Number(inv[targetLock]) || 0)) <= 0) {
      return { ok: false, reason: "Locked door" };
    }

    if (
      targetCell === 0 ||
      targetCell === 3 ||
      targetCell === 18 ||
      targetCell === TELEPORT_CELL ||
      isArrowCell(targetCell) ||
      isKeyCell(targetCell) ||
      isLockCell(targetCell) ||
      targetHourglass
    ) {
      ensureCloned();
      next.playerPos = { x: tx, y: ty };

      if (targetKey || targetLock || targetHourglass) {
        if (targetKey) {
          next.inventory[targetKey] = Math.max(0, Math.floor(Number(next.inventory[targetKey]) || 0)) + 1;
        } else if (targetLock) {
          next.inventory[targetLock] = Math.max(0, Math.floor(Number(next.inventory[targetLock]) || 0)) - 1;
        }
        next.grid[ty][tx] = 0;
        next.baseGrid[ty][tx] = 0;
      }
      return { ok: true, state: next };
    }

    if (targetCell === 6) {
      const k = `${tx},${ty}`;
      if (!br.get(k)) {
        ensureCloned();
        next.breakableRockStates.set(k, true);
        next.playerPos = { x: tx, y: ty };
        return { ok: true, state: next };
      }
      return { ok: false, reason: "Breakable rock already stepped" };
    }

    const dirs = getArrowDirections(playerCell);
    const isArrowDir = dirs.some((d) => d.dx === dx && d.dy === dy);
    if (!isArrowDir) {
      return { ok: false, reason: "Arrow direction mismatch" };
    }

    const glide = computePlayerGlidePath(grid, { x: px, y: py }, dx, dy, playerCell);
    if (glide.path.length === 0) {
      return { ok: false, reason: "No glide path" };
    }

    ensureCloned();
    for (let i = 0; i < glide.path.length; i++) {
      const step = glide.path[i];
      const prevPos = i === 0 ? { x: px, y: py } : glide.path[i - 1];
      if (i === 0) next.grid[py][px] = 5;
      else next.grid[prevPos.y][prevPos.x] = next.baseGrid[prevPos.y][prevPos.x];
      next.grid[step.y][step.x] = glide.arrowType;
      next.playerPos = { x: step.x, y: step.y };
    }
    return { ok: true, state: next };
  }

  const currentCell = playerCell;
  let willBreakRock = false;
  if (currentCell === 6) {
    const k = `${px},${py}`;
    if (br.get(k)) willBreakRock = true;
  }

  if (targetCell === 2) {
    return { ok: false, reason: "Stone" };
  }

  if (targetCell === 6) {
    const k = `${tx},${ty}`;
    if (!br.get(k)) {
      ensureCloned();
      next.breakableRockStates.set(k, true);
      if (willBreakRock) {
        next.grid[py][px] = 5;
      }
      next.playerPos = { x: tx, y: ty };
      return { ok: true, state: next };
    }
    return { ok: false, reason: "Breakable rock already stepped" };
  }

  if (targetLock && Math.max(0, Math.floor(Number(inv[targetLock]) || 0)) <= 0) {
    return { ok: false, reason: "Locked door" };
  }
  if (targetCell === 1 || targetCell === 4 || targetCell === 5) {
    return { ok: false, reason: targetCell === 1 ? "Fire" : targetCell === 4 ? "Water" : "Void" };
  }

  ensureCloned();
  next.playerPos = { x: tx, y: ty };
  if (targetKey || targetLock || targetHourglass) {
    if (targetKey) {
      next.inventory[targetKey] = Math.max(0, Math.floor(Number(next.inventory[targetKey]) || 0)) + 1;
    } else if (targetLock) {
      next.inventory[targetLock] = Math.max(0, Math.floor(Number(next.inventory[targetLock]) || 0)) - 1;
    }
    next.grid[ty][tx] = 0;
    next.baseGrid[ty][tx] = 0;
  }
  if (willBreakRock) {
    next.grid[py][px] = 5;
    next.baseGrid[py][px] = 5;
  }
  return { ok: true, state: next };
}

export function applyTeleportCycleAtomic(prev: SolveState): ActionResult {
  const { grid, playerPos } = prev;
  if (grid[playerPos.y]?.[playerPos.x] !== TELEPORT_CELL) {
    return { ok: false, reason: "Not on teleport pad" };
  }
  const dest = getNextTeleport(grid, playerPos);
  if (!dest) {
    return { ok: false, reason: "No teleport destination" };
  }
  return {
    ok: true,
    state: {
      grid: prev.grid,
      baseGrid: prev.baseGrid,
      playerPos: dest,
      inventory: prev.inventory,
      breakableRockStates: prev.breakableRockStates,
    },
  };
}

export function applyRemoteArrowMoveAtomic(prev: SolveState, arrowPos: Position, dx: number, dy: number): ActionResult {
  const grid = prev.grid;
  const baseGrid = prev.baseGrid;
  const ax = arrowPos.x;
  const ay = arrowPos.y;
  const arrowCell = grid[ay]?.[ax] as CellType | undefined;
  if (arrowCell === undefined || !isArrowCell(arrowCell)) {
    return { ok: false, reason: "Not an arrow tile" };
  }

  const dirs = getArrowDirections(arrowCell);
  const isValid = dirs.some((d) => d.dx === dx && d.dy === dy);
  if (!isValid) {
    return { ok: false, reason: "Arrow direction mismatch" };
  }

  const glide = computeRemoteArrowGlidePath(grid, { x: ax, y: ay }, dx, dy, arrowCell);
  if (glide.path.length === 0) {
    return { ok: false, reason: "No glide path" };
  }

  const next: SolveState = {
    grid: cloneGrid(grid),
    baseGrid,
    playerPos: { ...prev.playerPos },
    inventory: prev.inventory,
    breakableRockStates: prev.breakableRockStates,
  };

  for (let i = 0; i < glide.path.length; i++) {
    const step = glide.path[i];
    const prevPos = i === 0 ? { x: ax, y: ay } : glide.path[i - 1];
    if (i === 0) next.grid[ay][ax] = 5;
    else next.grid[prevPos.y][prevPos.x] = next.baseGrid[prevPos.y][prevPos.x];
    next.grid[step.y][step.x] = glide.arrowType;
  }

  return { ok: true, state: next };
}

export function inferRejectReason(prev: SolveState, dx: number, dy: number, action: Action): string {
  const px = prev.playerPos.x;
  const py = prev.playerPos.y;
  const tx = px + dx;
  const ty = py + dy;
  if (ty < 0 || ty >= prev.grid.length || tx < 0 || tx >= prev.grid[0].length) return "Out of bounds";

  const playerCell = prev.grid[py][px] as CellType;
  const targetCell = prev.grid[ty][tx] as CellType;

  if (action.t === "T") {
    if (playerCell !== TELEPORT_CELL) return "Not on teleport pad";
    if (!getNextTeleport(prev.grid, prev.playerPos)) return "No teleport destination";
    return "Unknown";
  }

  if (action.t === "A") {
    const arrowCell = prev.grid[action.y]?.[action.x] as CellType | undefined;
    if (arrowCell === undefined || !isArrowCell(arrowCell)) return "Not an arrow tile";
    const dirs = getArrowDirections(arrowCell);
    const v = DIR_VECTORS[action.d];
    const isValid = dirs.some((d) => d.dx === v.dx && d.dy === v.dy);
    if (!isValid) return "Arrow direction mismatch";
    const glide = computeRemoteArrowGlidePath(prev.grid, { x: action.x, y: action.y }, v.dx, v.dy, arrowCell);
    if (glide.path.length === 0) return "No glide path";
    return "Unknown";
  }

  if (isArrowCell(playerCell)) {
    const targetLock = lockColorForCell(targetCell);
    if (targetLock && Math.max(0, Math.floor(Number(prev.inventory[targetLock]) || 0)) <= 0) return "Locked door";

    const walkable =
      targetCell === 0 ||
      targetCell === 3 ||
      targetCell === 18 ||
      targetCell === TELEPORT_CELL ||
      isArrowCell(targetCell) ||
      isKeyCell(targetCell) ||
      isLockCell(targetCell) ||
      isHourglassCell(targetCell);

    if (!walkable) {
      if (targetCell === 6) {
        const k = `${tx},${ty}`;
        if (prev.breakableRockStates.get(k)) return "Breakable rock already stepped";
        return "Unknown";
      }
      const dirs = getArrowDirections(playerCell);
      const isArrowDir = dirs.some((d) => d.dx === dx && d.dy === dy);
      if (!isArrowDir) return "Arrow direction mismatch";
      const glide = computePlayerGlidePath(prev.grid, { x: px, y: py }, dx, dy, playerCell);
      if (glide.path.length === 0) return "No glide path";
      return "Unknown";
    }

    if (targetCell === 6) {
      const k = `${tx},${ty}`;
      if (prev.breakableRockStates.get(k)) return "Breakable rock already stepped";
      return "Unknown";
    }

    return "Unknown";
  }

  if (targetCell === 2) return "Stone";
  if (targetCell === 6) {
    const k = `${tx},${ty}`;
    if (prev.breakableRockStates.get(k)) return "Breakable rock already stepped";
    return "Unknown";
  }
  const targetLock = lockColorForCell(targetCell);
  if (targetLock && Math.max(0, Math.floor(Number(prev.inventory[targetLock]) || 0)) <= 0) return "Locked door";
  if (targetCell === 1) return "Fire";
  if (targetCell === 4) return "Water";
  if (targetCell === 5) return "Void";
  return "Unknown";
}

export function applyAction(state: SolveState, action: Action): ActionResult {
  if (action.t === "P") {
    const v = DIR_VECTORS[action.d];
    return applyPlayerMoveAtomic(state, v.dx, v.dy);
  }
  if (action.t === "T") {
    return applyTeleportCycleAtomic(state);
  }
  if (action.t === "A") {
    const v = DIR_VECTORS[action.d];
    return applyRemoteArrowMoveAtomic(state, { x: action.x, y: action.y }, v.dx, v.dy);
  }
  return { ok: false, reason: "Unknown action" };
}

export interface Successor {
  action: Action;
  actionString: string;
  description: string;
  state: SolveState;
}

export function* generateSuccessors(state: SolveState): Generator<Successor> {
  for (const dir of DIRS) {
    const result = applyPlayerMoveAtomic(state, dir.dx, dir.dy);
    if (result.ok && result.state) {
      yield {
        action: { t: "P", d: dir.k },
        actionString: `P:${dir.k}`,
        description: `Move ${DIR_LABELS[dir.k]}`,
        state: result.state,
      };
    }
  }

  {
    const result = applyTeleportCycleAtomic(state);
    if (result.ok && result.state) {
      yield {
        action: { t: "T" },
        actionString: "T",
        description: "Wait for teleport",
        state: result.state,
      };
    }
  }

  const rows = state.grid.length;
  const cols = state.grid[0]?.length ?? 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x === state.playerPos.x && y === state.playerPos.y) continue;
      const cell = state.grid[y][x] as CellType;
      if (!isArrowCell(cell)) continue;
      const dirs = getArrowDirections(cell);
      for (const d of dirs) {
        const kdir = d.dx === 0 && d.dy === -1 ? "U" : d.dx === 1 && d.dy === 0 ? "R" : d.dx === 0 && d.dy === 1 ? "D" : "L";
        const result = applyRemoteArrowMoveAtomic(state, { x, y }, d.dx, d.dy);
        if (result.ok && result.state) {
          yield {
            action: { t: "A", x, y, d: kdir },
            actionString: `A(${x},${y}):${kdir}`,
            description: `Slide arrow (${x}, ${y}) ${DIR_LABELS[kdir]}`,
            state: result.state,
          };
        }
      }
    }
  }
}
