import type { CellType, KeyInventory, Position } from "@/game/types";

export type DirKey = "U" | "R" | "D" | "L";

export interface SolveState {
  grid: CellType[][];
  baseGrid: CellType[][];
  playerPos: Position;
  inventory: KeyInventory;
  breakableRockStates: Map<string, boolean>;
}

export const DIRS: Array<{ dx: number; dy: number; k: DirKey }> = [
  { dx: 0, dy: -1, k: "U" },
  { dx: 1, dy: 0, k: "R" },
  { dx: 0, dy: 1, k: "D" },
  { dx: -1, dy: 0, k: "L" },
];

export const DIR_VECTORS: Record<DirKey, { dx: number; dy: number }> = {
  U: { dx: 0, dy: -1 },
  R: { dx: 1, dy: 0 },
  D: { dx: 0, dy: 1 },
  L: { dx: -1, dy: 0 },
};

export const DIR_LABELS: Record<DirKey, string> = {
  U: "Up",
  R: "Right",
  D: "Down",
  L: "Left",
};

export function stateKey(s: SolveState): string {
  const rows = s.grid.length;
  const cols = s.grid[0]?.length ?? 0;
  const inv = `r${Math.max(0, Math.floor(Number(s.inventory.red) || 0))}g${Math.max(0, Math.floor(Number(s.inventory.green) || 0))}`;
  let br = "";
  if (s.breakableRockStates.size > 0) {
    const keys: string[] = [];
    for (const [k, v] of s.breakableRockStates.entries()) {
      if (!v) continue;
      const [xs, ys] = k.split(",");
      const x = Number(xs);
      const y = Number(ys);
      if (Number.isFinite(x) && Number.isFinite(y) && s.grid[y]?.[x] === 6) keys.push(k);
    }
    keys.sort();
    if (keys.length) br = `|b:${keys.join(";")}`;
  }
  const g = s.grid.map((r) => r.join(",")).join("|");
  const bg = s.baseGrid.map((r) => r.join(",")).join("|");
  return `${rows}x${cols}|p:${s.playerPos.x},${s.playerPos.y}|i:${inv}|g:${g}|bg:${bg}${br}`;
}
