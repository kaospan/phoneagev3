import type { Position } from "@/game/types";
import { generateSuccessors } from "@/lib/solver/actions";
import type { SolveState } from "@/lib/solver/state";
import { stateKey } from "@/lib/solver/state";
import { LifoStack } from "../frontier";
import type { AlgorithmDescriptor, SearchEvent, SearchLimits, SearchResult } from "../types";
import { goalKeySet, isGoalState, reconstructActions } from "./shared";

interface StackItem {
  key: string;
  state: SolveState;
  depth: number;
}

/**
 * Iterative-deepening DFS: run a depth-limited DFS with limit 1, then 2, then 3, ... until a
 * solution turns up. Each pass gets its own tracking (deliberately reset every pass — a shallow
 * state revisited on a deeper pass is not a bug, it's the whole mechanism), so shallow parts of
 * the graph get re-explored on every single pass. That repetition is real, wasted work — the
 * trade this algorithm makes for combining DFS's flat, tiny memory footprint (only ever holds
 * one root-to-leaf path, never a wide frontier) with BFS's guarantee.
 *
 * Within a single pass, a plain "visited on first sighting, never again" set is NOT safe here —
 * that guarantee (first visit = shortest path to that state) is what BFS's FIFO order gives you
 * for free, but a stack has no such property: DFS can easily reach some intermediate state via
 * a long, winding path before it would reach that same state via a short one, simply because of
 * which branch happens to get popped first. Marking it permanently visited at the long path's
 * depth would then silently block the short path from ever being explored — even within a pass
 * whose depth limit was enough to find it, which would make the reported "optimal" length wrong
 * (this was caught empirically: level 4 returned 10 moves against BFS's true 8 before this was
 * fixed). The fix mirrors astar.ts's reopening: `bestDepth` records the best depth found so far
 * per key, and a state is only skipped if an equal-or-better depth is already known — otherwise
 * it's pushed again. Because the stack is LIFO, a freshly-improved (pushed-just-now) entry is
 * always popped before an older, worse one for the same key, so the improvement is guaranteed to
 * be processed before the stale entry is ever looked at.
 */
function* run(start: SolveState, goalCaves: Position[], limits: SearchLimits): Generator<SearchEvent, SearchResult> {
  const t0 = performance.now();
  const goalKeys = goalKeySet(goalCaves);
  const startKey = stateKey(start);

  if (isGoalState(start, goalKeys)) {
    return { solved: true, moves: 0, actions: [], endReason: "solved" };
  }

  let expandedCount = 0;

  for (let depthLimit = 1; depthLimit <= limits.maxDepth; depthLimit += 1) {
    const frontier = new LifoStack<StackItem>();
    const bestDepth = new Map<string, number>([[startKey, 0]]);
    const prev = new Map<string, { p: string; a: string }>();
    frontier.push({ key: startKey, state: start, depth: 0 });

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
      const { key, state, depth } = item;

      // Stale entry: a strictly-better (or equal) depth for this key was already found and
      // pushed since this entry was created — skip it (see doc comment).
      const recordedDepth = bestDepth.get(key);
      if (recordedDepth !== undefined && depth > recordedDepth) continue;

      expandedCount += 1;
      yield { type: "expand", stateKey: key, playerPos: state.playerPos, depth, g: depth, frontierSize: frontier.length };

      if (isGoalState(state, goalKeys)) {
        const actions = reconstructActions(prev, startKey, key);
        yield { type: "goal", stateKey: key, depth, actions };
        return { solved: true, moves: actions.length, actions, endReason: "solved" };
      }

      // Depth cap for THIS pass only — not the search's overall maxDepth limit — so this pass
      // treats depth-limit nodes as leaves and lets the next pass go one level deeper.
      if (depth >= depthLimit) continue;

      for (const succ of generateSuccessors(state)) {
        const nk = stateKey(succ.state);
        const nd = depth + 1;
        const prevBest = bestDepth.get(nk);
        if (prevBest !== undefined && prevBest <= nd) {
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
        bestDepth.set(nk, nd);
        prev.set(nk, { p: key, a: succ.actionString });

        frontier.push({ key: nk, state: succ.state, depth: nd });
        yield {
          type: "generate",
          stateKey: nk,
          parentKey: key,
          actionString: succ.actionString,
          description: succ.description,
          playerPos: succ.state.playerPos,
          depth: nd,
          g: nd,
          frontierSize: frontier.length,
        };
      }
    }
    // This pass's depth limit wasn't enough — try again one level deeper.
  }

  return {
    solved: false,
    moves: null,
    actions: [],
    reason: "No solution found within the maximum depth",
    endReason: "depth_limit",
  };
}

export const iddfs: AlgorithmDescriptor = {
  id: "iddfs",
  name: "Iterative Deepening DFS",
  shortDescription: "Repeats a depth-limited DFS with a growing limit — DFS's memory, BFS's guarantee.",
  explanation:
    "IDDFS runs a depth-limited DFS with limit 1, then throws that away and runs a fresh depth-limited DFS with limit 2, then limit 3, and so on. Each pass revisits everything the previous pass already saw — that's real, deliberate waste. What it buys back is BFS's optimality guarantee (the first pass whose limit reaches the goal does so at the shallowest possible depth) using only DFS's tiny memory footprint, since a depth-limited DFS never needs to hold more than one root-to-leaf path at a time. Watch the stats: expanded-state counts climb pass over pass, often ending up well above plain BFS's count for the same final answer — that's the price of never remembering a wide frontier.",
  equationsNote:
    "Same units as BFS/DFS: g(n) is actions taken so far, equal to depth. No heuristic is used, so there's no h(n) or f(n). The one extra number worth watching is the current pass's depth limit itself (shown in the frontier diagram above), which resets to 0 and climbs by 1 every time a fresh pass starts.",
  usesHeuristic: false,
  optimalGuaranteed: true,
  frontierKind: "iterative-deepening",
  pseudocode: [
    "for depthLimit = 1, 2, 3, …:",
    "  stack ← [start]; bestDepth ← {start: 0}   // fresh every pass",
    "  while stack not empty:",
    "    node ← stack.pop()",
    "    if node is goal: return path   // shallowest possible — optimal",
    "    if node.depth >= depthLimit: continue   // leaf for this pass",
    "    for each neighbor: if this is the best depth seen for it, stack.push(neighbor)",
  ],
  realWorldUses: [
    "Game-playing search (e.g. chess engines) where memory is tight but move quality matters",
    "Any BFS-shaped problem on hardware too memory-constrained to hold a wide frontier",
    "A building block for IDA* — the iterative-deepening counterpart to A*",
  ],
  advantages: [
    "Combines BFS's optimality guarantee with DFS's flat, minimal memory footprint",
    "Never holds a wide frontier — just the current root-to-leaf path",
    "A good fit when memory, not time, is the scarce resource",
  ],
  disadvantages: [
    "Repeats a lot of work — shallow states get re-explored on every deeper pass",
    "Usually far slower in wall-clock time and total states expanded than plain BFS or A*",
  ],
  run,
};
