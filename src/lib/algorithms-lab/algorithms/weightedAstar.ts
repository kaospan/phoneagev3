import type { Position } from "@/game/types";
import { generateSuccessors } from "@/lib/solver/actions";
import { manhattanToGoal } from "@/lib/solver/heuristics";
import type { SolveState } from "@/lib/solver/state";
import { stateKey } from "@/lib/solver/state";
import { MinHeap } from "../frontier";
import type { AlgorithmDescriptor, SearchEvent, SearchLimits, SearchResult } from "../types";
import { goalKeySet, isGoalState, reconstructActions } from "./shared";

/** How much extra weight the heuristic gets over the real cost-so-far. 1.0 would be plain A*;
 *  higher values lean further toward Greedy, trading the optimality guarantee for speed. */
export const ASTAR_WEIGHT = 2;

interface HeapItem {
  key: string;
  state: SolveState;
  depth: number;
  g: number;
  h: number;
}

/**
 * Weighted A*: f(n) = g(n) + W·h(n) for W > 1. Because this deliberately does NOT claim
 * optimality (a weighted, over-trusting heuristic can't offer A*'s guarantee even before
 * accounting for this game's own admissibility caveat — see astar.ts's doc comment), it doesn't
 * need that file's reopening/pop-time-testing machinery: a simple closed-on-generation set
 * (the same shape as greedyBestFirst.ts) is enough, since there's no optimality promise for an
 * inconsistent heuristic to silently violate. That's the actual lesson this file demonstrates —
 * the extra care in astar.ts exists *specifically* to protect a guarantee, and once you give up
 * the guarantee, the algorithm gets simpler again.
 */
function* run(start: SolveState, goalCaves: Position[], limits: SearchLimits): Generator<SearchEvent, SearchResult> {
  const t0 = performance.now();
  const goalKeys = goalKeySet(goalCaves);
  const startKey = stateKey(start);

  if (isGoalState(start, goalKeys)) {
    return { solved: true, moves: 0, actions: [], endReason: "solved" };
  }

  const frontier = new MinHeap<HeapItem>((item) => item.g + ASTAR_WEIGHT * item.h);
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
    yield {
      type: "expand",
      stateKey: key,
      playerPos: state.playerPos,
      depth,
      g,
      h,
      f: g + ASTAR_WEIGHT * h,
      frontierSize: frontier.length,
    };

    if (isGoalState(state, goalKeys)) {
      const actions = reconstructActions(prev, startKey, key);
      yield { type: "goal", stateKey: key, depth, actions };
      return { solved: true, moves: actions.length, actions, endReason: "solved" };
    }

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
        f: ng + ASTAR_WEIGHT * nh,
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

export const weightedAstar: AlgorithmDescriptor = {
  id: "weightedAstar",
  name: "Weighted A*",
  shortDescription: `Like A*, but the heuristic counts ${ASTAR_WEIGHT}× as much — faster, no longer guaranteed shortest.`,
  explanation:
    `Weighted A* uses f(n) = g(n) + ${ASTAR_WEIGHT}·h(n) instead of A*'s f(n) = g(n) + h(n) — the heuristic's estimate is trusted more than the cost actually spent. That pulls the search closer to Greedy's behavior: it commits harder to states that look close to the goal, expanding fewer states in exchange for giving up A*'s optimality guarantee. A well-known bound still holds in the textbook case (weighted A* with an admissible h is never more than ${ASTAR_WEIGHT}× the optimal length) — a good illustration of a "tunable" search: dial the weight from 1 (A*) up toward Greedy, trading solution quality for speed as you go.`,
  equationsNote:
    `Same units as A*: g(n) counts actions, h(n) counts tiles of estimated distance. The only change is the ${ASTAR_WEIGHT} multiplying h(n) — a plain, unitless weight, not a distance itself. It scales how much one tile of estimate counts relative to one action already spent: at weight 1 this is exactly A*; the higher the weight climbs, the less g(n) matters at all, sliding toward Greedy's behavior.`,
  usesHeuristic: true,
  optimalGuaranteed: false,
  frontierKind: "priority-f",
  pseudocode: [
    `frontier ← priority queue ordered by f(n) = g(n) + ${ASTAR_WEIGHT}·h(n)`,
    "frontier.push(start, g=0)",
    "while frontier not empty:",
    "  node ← frontier.popMin()   // smallest weighted f(n)",
    "  if node is goal: return path",
    "  for each neighbor: compute g, h, weighted f; frontier.push(neighbor)",
  ],
  realWorldUses: [
    "Real-time pathfinding budgets (games, robotics) where a near-optimal answer fast beats a perfect answer slow",
    "Large-scale route planning where true A* would take too long to finish in time",
    "Anytime-search systems that start greedy and dial the weight down toward 1 as time allows",
  ],
  advantages: [
    "Faster than true A* — leaning on the heuristic more aggressively expands fewer states",
    "Still bounded, not reckless: a well-behaved heuristic keeps the result within a known factor of optimal",
    "Tunable — the weight is a dial between A*'s guarantee and Greedy's speed",
  ],
  disadvantages: [
    "No longer guaranteed optimal — can return a longer-than-necessary solution",
    "Picking a good weight is a balancing act: too high behaves like Greedy, too low like A*",
  ],
  run,
};
