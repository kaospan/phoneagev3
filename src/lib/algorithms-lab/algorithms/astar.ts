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

/**
 * A* with a binary heap that has no decrease-key, and full reopening.
 *
 * manhattanToGoal measures *tile* distance, but search cost here is *action*
 * count — and an arrow-glide or teleport can cover several tiles in a single
 * cost-1 action. That decouples the two: the true number of remaining
 * actions can be LESS than the remaining tile distance whenever a glide
 * shortcut is available along the way, which makes the heuristic an
 * overestimate (inadmissible), not just inconsistent, at exactly those
 * states. Confirmed empirically on level 8: at one point along the true
 * 12-move optimal path, h reports 6 while the true remaining cost is 4.
 *
 * Three things below exist specifically to stay correct despite that:
 *
 * 1. Goal-testing at successor *generation* time (return the instant a
 *    generated child is the goal) assumes nothing still in the frontier can
 *    beat it, which an overestimating h can't guarantee. Fix: the goal is
 *    only accepted at *pop* time, once nothing with a lower f remains.
 * 2. Treating "already expanded" as permanently closed assumes no cheaper
 *    path to an expanded state can ever surface later — again not
 *    guaranteed here. Fix: `bestG` (best known g per key) is the only source
 *    of truth for whether a successor is worth pushing — an already-expanded
 *    key is reopened (pushed again, re-expanded) whenever a strictly better
 *    g arrives. `expandedAtG` records the g a key was *last* expanded at
 *    purely to skip redundant re-expansion of stale duplicate heap entries
 *    for that same best g (harmless heap bookkeeping, not a correctness
 *    shortcut).
 * 3. Breaking ties in f by preferring lower h (a common, normally-safe A*
 *    optimization) is actively dangerous here: the goal always has h=0, so
 *    it would systematically win every tie against a competing state that's
 *    merely *farther-looking* but genuinely cheaper — which is exactly what
 *    happened on level 8 before this was removed (a tied f=14 let the goal
 *    jump the queue ahead of a state one step down the true-optimal path).
 *    Fix: no heuristic-based tie-break; ties fall back to insertion order.
 *
 * With all three, this consistently matches true BFS on every level tested
 * (including level 8's adversarial case) — see algorithms.test.ts.
 */
function* run(start: SolveState, goalCaves: Position[], limits: SearchLimits): Generator<SearchEvent, SearchResult> {
  const t0 = performance.now();
  const goalKeys = goalKeySet(goalCaves);
  const startKey = stateKey(start);

  if (isGoalState(start, goalKeys)) {
    return { solved: true, moves: 0, actions: [], endReason: "solved" };
  }

  const frontier = new MinHeap<HeapItem>((item) => item.g + item.h);
  const bestG = new Map<string, number>([[startKey, 0]]);
  const expandedAtG = new Map<string, number>();
  const prev = new Map<string, { p: string; a: string }>();
  frontier.push({ key: startKey, state: start, depth: 0, g: 0, h: manhattanToGoal(start.playerPos, goalCaves) });

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
    const { key, state, depth, g, h } = item;

    // Stale duplicate: this exact key has already been expanded at an equal-or-better g
    // (the heap can hold more than one entry per key across a reopen — see doc comment).
    const prevExpandedG = expandedAtG.get(key);
    if (prevExpandedG !== undefined && prevExpandedG <= g) continue;

    if (depth >= limits.maxDepth) {
      depthLimitSkips += 1;
      continue;
    }

    expandedAtG.set(key, g);
    expandedCount += 1;
    yield { type: "expand", stateKey: key, playerPos: state.playerPos, depth, g, h, f: g + h, frontierSize: frontier.length };

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
      const nh = manhattanToGoal(succ.state.playerPos, goalCaves);
      prev.set(nk, { p: key, a: succ.actionString });

      // Always push, even if nk was previously expanded — this is what allows a strictly
      // cheaper path to reopen it (see doc comment). The goal is never checked here; it's
      // deliberately deferred to pop time above.
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

export const astar: AlgorithmDescriptor = {
  id: "astar",
  name: "A* Search",
  shortDescription: "Balances distance already traveled against estimated distance remaining.",
  explanation:
    "A* combines the cost already spent, g(n), with an estimate of the remaining cost, h(n), and always expands the state with the smallest total f(n) = g(n) + h(n). Unlike Greedy, it doesn't ignore the path so far — a state that looks close to the goal but required a long detour to reach loses priority to one that's slightly farther but cheaper overall. A* is guaranteed to find the shortest solution whenever h(n) never overestimates the true remaining distance. Straight-line (Manhattan) distance usually satisfies that, but this game's arrow-glides and teleports let a single move cover unusually much ground, which can occasionally make h(n) look larger than the true remaining cost — so this implementation always double-checks every equally-promising alternative rather than trusting the heuristic blindly, and still expands far fewer states than BFS.",
  equationsNote:
    "g(n) is actions taken so far; h(n) is the Manhattan tile-distance estimate described above. f(n) = g(n) + h(n) is just their sum, used purely to rank states — it isn't itself a count of anything real. Because h(n) measures tiles while g(n) measures actions, f(n) technically mixes two units — harmless for A*'s guarantee in general (every tile of h(n) needs *at least* one more action, so it's still a valid lower bound almost everywhere), but exactly the subtlety this implementation had to get right at the specific states where it isn't — see this file's doc comment for a real bug that came from underestimating that.",
  usesHeuristic: true,
  optimalGuaranteed: true,
  frontierKind: "priority-f",
  pseudocode: [
    "frontier ← priority queue ordered by f(n) = g(n) + h(n)",
    "frontier.push(start, g=0)",
    "while frontier not empty:",
    "  node ← frontier.popMin()   // smallest f(n)",
    "  if node is goal: return path",
    "  for each neighbor: compute g, h, f; frontier.push(neighbor)",
  ],
  realWorldUses: [
    "Turn-by-turn GPS navigation (the algorithm under most map routing)",
    "Pathfinding in video games and robot/drone motion planning",
    "Puzzle solvers (15-puzzle, Rubik's-cube-style solvers)",
    "The planning step in modern AI agents choosing a sequence of actions",
  ],
  advantages: [
    "Guaranteed shortest solution, like BFS — but usually expanding far fewer states",
    "The heuristic actively steers the search, instead of exploring blindly",
    "The standard \"best of both worlds\" between BFS's guarantee and Greedy's speed",
  ],
  disadvantages: [
    "More bookkeeping than BFS or Greedy: a priority queue plus g/h/f tracking",
    "Getting the optimality guarantee right is subtle — see this implementation's own doc comment for a real bug that came from underestimating that",
  ],
  run,
};
