import type { Position } from "@/game/types";
import type { SolveState } from "@/lib/solver/state";

export type AlgorithmId =
  | "bfs"
  | "dfs"
  | "greedy"
  | "astar"
  | "dijkstra"
  | "weightedAstar"
  | "iddfs"
  | "beamSearch"
  | "hillClimbing"
  | "simulatedAnnealing";

export type RejectReason = "visited" | "worse-path" | "beam-pruned" | "annealing-rejected";

/**
 * One discrete step of a search, emitted by an algorithm generator. Carries only
 * keys/scalars (never a full SolveState/grid) so the UI layer can retain long event
 * histories without holding onto cloned grids.
 */
export type SearchEvent =
  | {
      type: "generate";
      stateKey: string;
      parentKey: string | null;
      actionString: string;
      description: string;
      playerPos: Position;
      depth: number;
      g: number;
      h?: number;
      f?: number;
      /** Simulated Annealing only — the "how adventurous" control value at this step. */
      temperature?: number;
      frontierSize: number;
    }
  | {
      type: "expand";
      stateKey: string;
      playerPos: Position;
      depth: number;
      g: number;
      h?: number;
      f?: number;
      temperature?: number;
      frontierSize: number;
    }
  | {
      type: "reject";
      stateKey: string;
      parentKey: string;
      actionString: string;
      description: string;
      playerPos: Position;
      reason: RejectReason;
    }
  | {
      type: "goal";
      stateKey: string;
      depth: number;
      actions: string[];
    };

export interface SearchStats {
  expanded: number;
  generated: number;
  rejected: number;
  frontierSize: number;
  maxFrontierSize: number;
  elapsedMs: number;
  currentDepth: number;
  solved: boolean | null;
  moves: number | null;
  endReason: "solved" | "timeout" | "node_limit" | "depth_limit" | "exhausted" | null;
  optimalGuaranteed: boolean;
  approxMemoryBytes: number;
}

export interface SearchLimits {
  maxExpansions: number;
  maxMs: number;
  maxDepth: number;
}

/** Mirrors the defaults solveGrid() uses in src/lib/solver/api.ts. */
export const DEFAULT_SEARCH_LIMITS: SearchLimits = {
  maxExpansions: 200_000,
  maxMs: 15_000,
  maxDepth: 300,
};

export interface SearchResult {
  solved: boolean;
  moves: number | null;
  actions: string[];
  reason?: string;
  endReason: "solved" | "timeout" | "node_limit" | "depth_limit" | "exhausted";
}

/** Which frontier data structure an algorithm uses — drives FrontierDiagram's illustration. */
export type FrontierKind =
  | "queue"
  | "stack"
  | "priority-h"
  | "priority-f"
  | "iterative-deepening"
  | "beam"
  | "single-state"
  | "annealing";

export const FRONTIER_KIND_LABEL: Record<FrontierKind, string> = {
  queue: "Queue — First In, First Out",
  stack: "Stack — Last In, First Out",
  "priority-h": "Priority queue — ordered by h(n), the estimated distance left",
  "priority-f": "Priority queue — ordered by f(n) = g(n) + h(n)",
  "iterative-deepening": "Stack, replayed from scratch with a growing depth limit",
  beam: "Layer-by-layer, keeping only the best few candidates each round",
  "single-state": "No frontier at all — just the one current state, replaced each step",
  annealing: "One current state, occasionally replaced by a worse one on purpose",
};

export interface AlgorithmDescriptor {
  id: AlgorithmId;
  name: string;
  shortDescription: string;
  explanation: string;
  /** What this algorithm's numbers actually measure and in what units — see ExplanationPanel's
   *  "the numbers, explained" section. The recurring point worth being explicit about: g(n) is
   *  always a count of actions taken, while h(n) (where used) is a count of grid tiles of
   *  straight-line distance — the same unit almost always, but not always, since some actions
   *  in this game cover more than one tile at once. */
  equationsNote: string;
  usesHeuristic: boolean;
  optimalGuaranteed: boolean;
  frontierKind: FrontierKind;
  /** Short line-by-line pseudocode mirroring the actual implementation's loop shape. */
  pseudocode: string[];
  /** Concrete, current applications — grounds the algorithm in practice, not just theory. */
  realWorldUses: string[];
  /** What this algorithm is genuinely good at, relative to the others in the Lab. */
  advantages: string[];
  /** The real costs/risks of choosing this algorithm — the other half of an honest comparison. */
  disadvantages: string[];
  run: (start: SolveState, goalCaves: Position[], limits: SearchLimits) => Generator<SearchEvent, SearchResult>;
}
