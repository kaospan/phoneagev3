// NOTE: Keep this in sync with the mapper palette (src/lib/levelgrid.ts).
// 18 is a non-goal "start marker" cave (black) used to show the original spawn tile.
// 19 is a teleport pad; pads are paired in reading order (0<->1, 2<->3, ...).
// 20 is a Bonus Time collectible that adds time to the per-level countdown timer.
export type CellType =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6
  | 7 | 8 | 9 | 10 | 11 | 12 | 13
  | 14 | 15 | 16 | 17
  | 18 | 19 | 20;

export interface KeyInventory {
  red: number;
  green: number;
}

export interface Position { x: number; y: number; }
export interface GameState {
  grid: CellType[][];
  baseGrid: CellType[][];
  playerPos: Position;
  inventory: KeyInventory;
  selectedArrow: Position | null;
  breakableRockStates: Map<string, boolean>;
  isGliding: boolean;
  isComplete: boolean;
}

export interface GlidePath { path: Position[]; }

export interface ArrowMoveResult {
  path: Position[];
  arrowType: CellType;
}

export interface PlayerGlideResult extends GlidePath { arrowType: CellType; }
