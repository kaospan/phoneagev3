import type { CellType, KeyInventory, Position } from "@/game/types";

export interface SolveOptions {
  maxMsPerLevel?: number;
  maxNodesPerLevel?: number;
  maxDepth?: number;
  onProgress?: (msg: string) => void;
  trace?: SolverTrace;
  searchMode?: "astar" | "bfs";
}

export interface LevelSolution {
  levelId: number;
  solved: boolean;
  moves: number | null;
  actions: string[];
  reason?: string;
  nodesExpanded: number;
  ms: number;
  trace?: SolverTrace;
}

export interface LevelDump {
  levelId: number;
  grid: number[][];
  playerStart: { x: number; y: number };
  cavePos: { x: number; y: number };
  theme?: string;
  arrowCount: number;
}

export interface SolveGridInitialState {
  inventory?: KeyInventory;
  breakableRockStates?: Map<string, boolean>;
}

export interface SolutionFrame {
  step: number;
  label: string;
  grid: CellType[][];
  playerPos: Position;
  arrowFrom?: Position;
  arrowTo?: Position;
}
