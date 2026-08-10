import type { CellType, KeyInventory, Position } from "@/game/types";
import type { Action, DirKey, SolveState } from "../state";
import { applyAction } from "../actions";
import { parseActionString } from "../replay";
import { cloneInventory, manhattanToGoal } from "../utils";

export interface TraceActionRecord {
  description: string;
  actionString: string;
  accepted: boolean;
  rejectionReason?: string;
  resultStateId?: number;
}

export interface CollisionRecord {
  fromNode: number;
  toNode: number;
  actionString: string;
}

export interface TraceNode {
  id: number;
  parentId: number | null;
  action: string;
  stateKey: string;
  playerPos: Position;
  inventory: KeyInventory;
  depth: number;
  expansionOrder: number | undefined;
  attemptedActions: TraceActionRecord[];
  distanceToGoal: number;
  renderedState?: SolveState;
}

export interface SolverTrace {
  levelId: number;
  startStateId: number;
  nodes: Map<number, TraceNode>;
  generationOrder: number[];
  expansionOrder: number[];
  furthestStateId: number | null;
  lastExpandedStateId: number | null;
  startGrid: CellType[][];
  startPlayerPos: Position;
  startInventory: KeyInventory;
  goalCaves: Position[];
  options: {
    maxMsPerLevel: number;
    maxNodesPerLevel: number;
    maxDepth: number;
  };
  endReason: "solved" | "timeout" | "node_limit" | "depth_limit" | "exhausted";
  nodesExpanded: number;
  statesGenerated: number;
  ms: number;
  collisions: CollisionRecord[];
  deadEnds: number[];
  closestManhattan: number;
}

export function createEmptyTrace(): SolverTrace {
  return {
    levelId: 0,
    startStateId: 0,
    nodes: new Map(),
    generationOrder: [],
    expansionOrder: [],
    furthestStateId: null,
    lastExpandedStateId: null,
    startGrid: [],
    startPlayerPos: { x: 0, y: 0 },
    startInventory: { red: 0, green: 0 },
    goalCaves: [],
    options: { maxMsPerLevel: 0, maxNodesPerLevel: 0, maxDepth: 0 },
    endReason: "exhausted",
    nodesExpanded: 0,
    statesGenerated: 0,
    ms: 0,
    collisions: [],
    deadEnds: [],
    closestManhattan: Infinity,
  };
}

export function reconstructState(trace: SolverTrace, nodeId: number): SolveState | null {
  const node = trace.nodes.get(nodeId);
  if (!node) return null;

  const path: Action[] = [];
  let cur = nodeId;
  while (cur !== undefined && cur !== trace.startStateId) {
    const n = trace.nodes.get(cur);
    if (!n) break;
    const action = parseActionString(n.action);
    if (!action) break;
    path.unshift(action);
    cur = n.parentId ?? trace.startStateId;
  }

  let state: SolveState = {
    grid: trace.startGrid.map((r) => r.slice()) as CellType[][],
    baseGrid: trace.startGrid.map((r) => r.slice()) as CellType[][],
    playerPos: { ...trace.startPlayerPos },
    inventory: { ...trace.startInventory },
    breakableRockStates: new Map(),
  };

  for (const action of path) {
    const result = applyAction(state, action);
    if (!result.ok || !result.state) return null;
    state = result.state;
  }

  return state;
}
