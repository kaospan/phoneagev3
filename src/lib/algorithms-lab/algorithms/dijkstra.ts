import type { Position } from "@/game/types";
import { generateSuccessors } from "@/lib/solver/actions";
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
}

/**
 * Dijkstra's algorithm: identical to A* (src/lib/algorithms-lab/algorithms/astar.ts) with one
 * difference — h(n) is always 0. No heuristic means no risk of over- or under-estimating
 * anything, so the extra care A* needs (pop-time goal testing, reopening) is cheap insurance
 * here rather than a necessity: with h=0, f=g exactly, so a plain closed-set (no reopening)
 * would already be safe. It's kept anyway for one reason worth showing: it makes Dijkstra and
 * A* the same engine shape with one number changed, which is the actual relationship between
 * them — A* is Dijkstra plus a heuristic, not a different algorithm.
 *
 * Because every action in this game costs exactly 1, Dijkstra's priority (g alone, same as f
 * since h=0) is identical to BFS's (depth alone) — so on this game specifically, Dijkstra
 * degenerates to BFS. Its real strength (handling graphs where edges have different costs)
 * isn't visible here; it would be if some moves cost more than others.
 */
function* run(start: SolveState, goalCaves: Position[], limits: SearchLimits): Generator<SearchEvent, SearchResult> {
  const t0 = performance.now();
  const goalKeys = goalKeySet(goalCaves);
  const startKey = stateKey(start);

  if (isGoalState(start, goalKeys)) {
    return { solved: true, moves: 0, actions: [], endReason: "solved" };
  }

  const frontier = new MinHeap<HeapItem>((item) => item.g);
  const bestG = new Map<string, number>([[startKey, 0]]);
  const expandedAtG = new Map<string, number>();
  const prev = new Map<string, { p: string; a: string }>();
  frontier.push({ key: startKey, state: start, depth: 0, g: 0 });

  let expandedCount = 0;
  let depthLimitSkips = 0;

  while (frontier.length > 0) {
    const now = performance.now();
    if (now - t0 > limits.maxMs) {
      return { solved: false, moves: null, actions: [], reason: `Timed out after ${Math.round(now - t0)}ms`, endReason: "timeout" };
    }
    if (expandedCount >= limits.maxExpansions) {
      return { solved: false, moves: null, actions: [], reason: `Expansion limit reached (${limits.maxExpansions})`, endReason: "node_limit" };
    }

    const item = frontier.pop();
    if (!item) break;
    const { key, state, depth, g } = item;

    const prevExpandedG = expandedAtG.get(key);
    if (prevExpandedG !== undefined && prevExpandedG <= g) continue;

    if (depth >= limits.maxDepth) {
      depthLimitSkips += 1;
      continue;
    }

    expandedAtG.set(key, g);
    expandedCount += 1;
    yield { type: "expand", stateKey: key, playerPos: state.playerPos, depth, g, frontierSize: frontier.length };

    if (isGoalState(state, goalKeys)) {
      const actions = reconstructActions(prev, startKey, key);
      yield { type: "goal", stateKey: key, depth, actions };
      return { solved: true, moves: actions.length, actions, endReason: "solved" };
    }

    for (const succ of generateSuccessors(state)) {
      const nk = stateKey(succ.state);
      const nd = depth + 1;
      const ng = g + 1;
      const prevBest = bestG.get(nk);
      if (prevBest !== undefined && prevBest <= ng) {
        yield {
          type: "reject",
          stateKey: nk,
          parentKey: key,
          actionString: succ.actionString,
          description: succ.description,
          playerPos: succ.state.playerPos,
          reason: "worse-path",
        };
        continue;
      }

      bestG.set(nk, ng);
      prev.set(nk, { p: key, a: succ.actionString });

      frontier.push({ key: nk, state: succ.state, depth: nd, g: ng });
      yield {
        type: "generate",
        stateKey: nk,
        parentKey: key,
        actionString: succ.actionString,
        description: succ.description,
        playerPos: succ.state.playerPos,
        depth: nd,
        g: ng,
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

export const dijkstra: AlgorithmDescriptor = {
  id: "dijkstra",
  name: "Dijkstra's Algorithm",
  shortDescription: "Expands the cheapest-so-far state first — no heuristic, no guessing.",
  explanation:
    "Dijkstra's algorithm always expands the state with the smallest cost-so-far, g(n). It uses no heuristic at all — no estimate of remaining distance, just the real cost already spent. That makes it optimal for any graph, including ones where different moves cost different amounts. In Phoneage, every action costs exactly 1, so g(n) and depth are the same thing — which means Dijkstra explores in the same layer-by-layer order as BFS. Its real advantage — handling varying move costs — doesn't get to show off on a level where every move is worth the same.",
  equationsNote:
    "g(n) is actions taken so far, same meaning as BFS's. Dijkstra defines h(n) as always exactly 0 — not 'unknown', a deliberate zero — so f(n) = g(n) + 0 = g(n). That's the actual reason its priority order collapses to BFS's on this game's uniform-cost moves: with h(n) always 0, there's nothing left to break the tie between g(n) and f(n).",
  usesHeuristic: false,
  optimalGuaranteed: true,
  frontierKind: "priority-f",
  pseudocode: [
    "frontier ← priority queue ordered by g(n)",
    "frontier.push(start, g=0)",
    "while frontier not empty:",
    "  node ← frontier.popMin()   // smallest g(n) — cheapest so far",
    "  if node is goal: return path",
    "  for each neighbor: compute g; frontier.push(neighbor)",
  ],
  realWorldUses: [
    "Road/flight routing where different routes have different real costs (time, tolls, fuel)",
    "Network routing protocols that pick the cheapest path between routers",
    "The foundation A*, IDA*, and many other cost-aware searches build on",
  ],
  advantages: [
    "Optimal even when different moves cost different amounts — not just uniform-cost games",
    "No heuristic to design or tune — works even when no good distance estimate exists",
    "Simple mental model: always take the cheapest unexplored option next",
  ],
  disadvantages: [
    "Explores with no sense of direction toward the goal, just like BFS",
    "On uniform-cost graphs like this one, it does the same work as BFS for no extra benefit",
  ],
  run,
};
