import type { Position } from "@/game/types";
import { generateSuccessors } from "@/lib/solver/actions";
import { manhattanToGoal } from "@/lib/solver/heuristics";
import type { SolveState } from "@/lib/solver/state";
import { stateKey } from "@/lib/solver/state";
import type { AlgorithmDescriptor, SearchEvent, SearchLimits, SearchResult } from "../types";
import { goalKeySet, isGoalState } from "./shared";

/**
 * Hill Climbing: no frontier, no memory of anywhere it's been — just one current state. Every
 * step, it looks at every legal neighbor, computes h(n) for each, and moves to whichever one is
 * lowest — provided that's actually an improvement. The moment no neighbor looks better than
 * staying put, it stops right there: this is the one algorithm in the Lab with no backtracking
 * mechanism whatsoever, so a local optimum isn't just costly, it's fatal to the search. Because
 * it only ever accepts a strictly-improving move, h(n) strictly decreases every accepted step,
 * which bounds the run length by h(start) with no need for any visited-set bookkeeping at all —
 * there's nothing to reopen or deduplicate when there's only ever one current state.
 */
function* run(start: SolveState, goalCaves: Position[], limits: SearchLimits): Generator<SearchEvent, SearchResult> {
  const t0 = performance.now();
  const goalKeys = goalKeySet(goalCaves);

  if (isGoalState(start, goalKeys)) {
    return { solved: true, moves: 0, actions: [], endReason: "solved" };
  }

  let current = start;
  let currentH = manhattanToGoal(start.playerPos, goalCaves);
  let depth = 0;
  const actions: string[] = [];
  let expandedCount = 0;

  for (;;) {
    const now = performance.now();
    if (now - t0 > limits.maxMs) {
      return { solved: false, moves: null, actions: [], reason: `Timed out after ${Math.round(now - t0)}ms`, endReason: "timeout" };
    }
    if (expandedCount >= limits.maxExpansions) {
      return { solved: false, moves: null, actions: [], reason: `Expansion limit reached (${limits.maxExpansions})`, endReason: "node_limit" };
    }
    if (depth >= limits.maxDepth) {
      return { solved: false, moves: null, actions: [], reason: "Depth limit reached", endReason: "depth_limit" };
    }

    expandedCount += 1;
    yield {
      type: "expand",
      stateKey: stateKey(current),
      playerPos: current.playerPos,
      depth,
      g: depth,
      h: currentH,
      f: depth + currentH,
      frontierSize: 1,
    };

    const candidates = Array.from(generateSuccessors(current));
    if (candidates.length === 0) {
      return { solved: false, moves: null, actions: [], reason: "Dead end — no legal moves from here", endReason: "exhausted" };
    }

    const currentKey = stateKey(current);
    const scored = candidates.map((succ) => ({ succ, h: manhattanToGoal(succ.state.playerPos, goalCaves) }));
    const goalCandidate = scored.find((c) => isGoalState(c.succ.state, goalKeys));

    if (goalCandidate) {
      for (const c of scored) {
        yield {
          type: "generate",
          stateKey: stateKey(c.succ.state),
          parentKey: currentKey,
          actionString: c.succ.actionString,
          description: c.succ.description,
          playerPos: c.succ.state.playerPos,
          depth: depth + 1,
          g: depth + 1,
          h: c.h,
          f: depth + 1 + c.h,
          frontierSize: scored.length,
        };
      }
      const finalActions = [...actions, goalCandidate.succ.actionString];
      yield { type: "goal", stateKey: stateKey(goalCandidate.succ.state), depth: depth + 1, actions: finalActions };
      return { solved: true, moves: finalActions.length, actions: finalActions, endReason: "solved" };
    }

    scored.sort((a, b) => a.h - b.h);
    const best = scored[0];

    if (best.h >= currentH) {
      // No neighbor looks any closer than staying put — stuck at a local optimum. Show every
      // candidate that was considered (all rejected, none good enough) before giving up.
      for (const c of scored) {
        yield {
          type: "reject",
          stateKey: stateKey(c.succ.state),
          parentKey: currentKey,
          actionString: c.succ.actionString,
          description: c.succ.description,
          playerPos: c.succ.state.playerPos,
          reason: "worse-path",
        };
      }
      return {
        solved: false,
        moves: null,
        actions: [],
        reason: "Stuck at a local optimum — no neighboring state looks closer to the goal",
        endReason: "exhausted",
      };
    }

    for (const c of scored) {
      const isBest = c === best;
      if (isBest) {
        yield {
          type: "generate",
          stateKey: stateKey(c.succ.state),
          parentKey: currentKey,
          actionString: c.succ.actionString,
          description: c.succ.description,
          playerPos: c.succ.state.playerPos,
          depth: depth + 1,
          g: depth + 1,
          h: c.h,
          f: depth + 1 + c.h,
          frontierSize: scored.length,
        };
      } else {
        yield {
          type: "reject",
          stateKey: stateKey(c.succ.state),
          parentKey: currentKey,
          actionString: c.succ.actionString,
          description: c.succ.description,
          playerPos: c.succ.state.playerPos,
          reason: "worse-path",
        };
      }
    }

    actions.push(best.succ.actionString);
    current = best.succ.state;
    currentH = best.h;
    depth += 1;
  }
}

export const hillClimbing: AlgorithmDescriptor = {
  id: "hillClimbing",
  name: "Hill Climbing",
  shortDescription: "Always steps to the single best-looking neighbor — no memory, no backtracking.",
  explanation:
    "Hill Climbing looks at every neighboring state and always steps to whichever one looks closest to the goal — no frontier, no memory of anywhere it's been, no backtracking. If no neighbor looks better than where it already is, it stops right there, even if a solution exists just a detour away. It's the purest, most myopic use of a heuristic possible: one state, one decision, every step.",
  equationsNote:
    "h(n) is the same Manhattan tile-distance estimate as Greedy and A*, used every step purely to rank this round's neighbors against each other and against staying put. There's no f(n) here — with no cost-so-far weighing involved, only 'which neighbor looks closest right now' matters.",
  usesHeuristic: true,
  optimalGuaranteed: false,
  frontierKind: "single-state",
  pseudocode: [
    "current ← start",
    "loop:",
    "  if current is goal: return path",
    "  best ← neighbor of current with smallest h(n)",
    "  if h(best) >= h(current): stop — stuck at a local optimum",
    "  current ← best",
  ],
  realWorldUses: [
    "Gradient descent in machine learning — the continuous-space version of this exact idea",
    "Quick local-improvement steps inside larger optimization pipelines",
    "A clean way to demonstrate why frontier-based search needs some way to backtrack",
  ],
  advantages: [
    "Uses almost no memory — only the current state needs to be remembered",
    "Extremely cheap per step — no priority queue or frontier bookkeeping at all",
    "A clear baseline for why Beam Search's wider net (and Simulated Annealing's willingness to backslide) exist",
  ],
  disadvantages: [
    "Gets permanently stuck at local optima — can report failure even when a solution exists nearby",
    "No way to recover once every neighbor looks worse than the current state",
    "No optimality or even completeness guarantee whatsoever",
  ],
  run,
};
