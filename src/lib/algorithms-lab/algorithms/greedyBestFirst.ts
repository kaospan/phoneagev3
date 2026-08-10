import type { Position } from "@/game/types";
import { generateSuccessors } from "@/lib/solver/actions";
import { manhattanToGoal } from "@/lib/solver/heuristics";
import type { SolveState } from "@/lib/solver/state";
import { stateKey } from "@/lib/solver/state";
import { MinHeap } from "../frontier";
import type { AlgorithmDescriptor, SearchEvent, SearchLimits, SearchResult } from "../types";
import { goalKeySet, isGoalState, reconstructActions } from "./shared";

interface HeapItem {
  key: string;
  state: SolveState;
  depth: number;
  g: number;
  h: number;
}

function* run(start: SolveState, goalCaves: Position[], limits: SearchLimits): Generator<SearchEvent, SearchResult> {
  const t0 = performance.now();
  const goalKeys = goalKeySet(goalCaves);
  const startKey = stateKey(start);

  if (isGoalState(start, goalKeys)) {
    return { solved: true, moves: 0, actions: [], endReason: "solved" };
  }

  const frontier = new MinHeap<HeapItem>((item) => item.h);
  const visited = new Set<string>([startKey]);
  const prev = new Map<string, { p: string; a: string }>();
  frontier.push({ key: startKey, state: start, depth: 0, g: 0, h: manhattanToGoal(start.playerPos, goalCaves) });

  let expanded = 0;
  let depthLimitSkips = 0;

  while (frontier.length > 0) {
    const now = performance.now();
    if (now - t0 > limits.maxMs) {
      return { solved: false, moves: null, actions: [], reason: `Timed out after ${Math.round(now - t0)}ms`, endReason: "timeout" };
    }
    if (expanded >= limits.maxExpansions) {
      return { solved: false, moves: null, actions: [], reason: `Expansion limit reached (${limits.maxExpansions})`, endReason: "node_limit" };
    }

    const item = frontier.pop();
    if (!item) break;
    const { key, state, depth, g, h } = item;

    if (depth >= limits.maxDepth) {
      depthLimitSkips += 1;
      continue;
    }

    expanded += 1;
    yield { type: "expand", stateKey: key, playerPos: state.playerPos, depth, g, h, f: g + h, frontierSize: frontier.length };

    for (const succ of generateSuccessors(state)) {
      const nk = stateKey(succ.state);
      if (visited.has(nk)) {
        yield {
          type: "reject",
          stateKey: nk,
          parentKey: key,
          actionString: succ.actionString,
          description: succ.description,
          playerPos: succ.state.playerPos,
          reason: "visited",
        };
        continue;
      }
      visited.add(nk);
      const nd = depth + 1;
      const ng = g + 1;
      const nh = manhattanToGoal(succ.state.playerPos, goalCaves);
      prev.set(nk, { p: key, a: succ.actionString });

      if (isGoalState(succ.state, goalKeys)) {
        const actions = reconstructActions(prev, startKey, nk);
        yield { type: "goal", stateKey: nk, depth: nd, actions };
        return { solved: true, moves: actions.length, actions, endReason: "solved" };
      }

      frontier.push({ key: nk, state: succ.state, depth: nd, g: ng, h: nh });
      yield {
        type: "generate",
        stateKey: nk,
        parentKey: key,
        actionString: succ.actionString,
        description: succ.description,
        playerPos: succ.state.playerPos,
        depth: nd,
        g: ng,
        h: nh,
        f: ng + nh,
        frontierSize: frontier.length,
      };
    }
  }

  return {
    solved: false,
    moves: null,
    actions: [],
    reason: "No solution found (search exhausted)",
    endReason: depthLimitSkips > 0 ? "depth_limit" : "exhausted",
  };
}

export const greedyBestFirst: AlgorithmDescriptor = {
  id: "greedy",
  name: "Greedy Best-First Search",
  shortDescription: "Always expands whichever state looks closest to the goal right now.",
  explanation:
    "Greedy Best-First Search chooses the state that appears closest to the goal according to the heuristic h(n) — the estimated remaining distance. It completely ignores g(n), how far it already walked to get there. That makes it fast when the heuristic points the right way, but it can walk straight into a dead end (a wall or locked door blocking the straight-line path) and have to backtrack, sometimes producing a much longer solution than necessary.",
  equationsNote:
    "h(n) is the Manhattan (straight-line, grid-tile) distance from a state's player position to the nearest goal tile — measured in tiles, not actions. Most actions move the player exactly one tile, so tiles and actions usually match, but this game's arrow-glides and teleports can cover several tiles in a single action, so h(n) only estimates remaining actions, never promises them. Greedy ranks purely by h(n) and never looks at g(n), how many actions it already spent.",
  usesHeuristic: true,
  optimalGuaranteed: false,
  frontierKind: "priority-h",
  pseudocode: [
    "frontier ← priority queue ordered by h(n)",
    "frontier.push(start)",
    "while frontier not empty:",
    "  node ← frontier.popMin()   // smallest h(n) — closest-looking to goal",
    "  if node is goal: return path",
    "  for each neighbor: frontier.push(neighbor)",
  ],
  realWorldUses: [
    "Quick approximate pathfinding when a good heuristic is available",
    "Real-time game NPC movement, where speed matters more than a perfect path",
    "Generating a fast first guess that a slower optimal solver then refines",
  ],
  advantages: [
    "Very fast when the heuristic reliably points the right way",
    "Often expands far fewer states than BFS — it never looks backward",
    "Good for quick, approximate answers when speed matters more than perfection",
  ],
  disadvantages: [
    "No optimality guarantee — can walk into a heuristic dead-end and backtrack expensively",
    "Entirely dependent on heuristic quality — a misleading heuristic can make it worse than BFS",
  ],
  run,
};
