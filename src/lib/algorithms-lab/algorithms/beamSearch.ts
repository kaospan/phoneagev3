import type { Position } from "@/game/types";
import { generateSuccessors } from "@/lib/solver/actions";
import { manhattanToGoal } from "@/lib/solver/heuristics";
import type { SolveState } from "@/lib/solver/state";
import { stateKey } from "@/lib/solver/state";
import type { AlgorithmDescriptor, SearchEvent, SearchLimits, SearchResult } from "../types";
import { goalKeySet, isGoalState, reconstructActions } from "./shared";

/** How many candidates survive the cut at the end of each layer. Wide enough to solve most
 *  levels, narrow enough that pruning — and the occasional resulting failure — is visible. */
export const BEAM_WIDTH = 50;

interface LayerItem {
  key: string;
  state: SolveState;
  depth: number;
}

interface Candidate {
  key: string;
  state: SolveState;
  depth: number;
  h: number;
  parentKey: string;
  actionString: string;
  description: string;
}

/**
 * Beam search: like Greedy Best-First, but instead of keeping every generated state in the
 * frontier, only the BEAM_WIDTH best-looking (lowest h) candidates survive the end of each
 * layer — the rest are discarded for good, never revisited. That's a hard, permanent cap on
 * both memory and time per layer, and it's also why beam search is the one algorithm in this
 * lab that isn't even guaranteed to find a solution at all (not just "not the shortest one"):
 * if the true path requires a move that looks temporarily worse than the beam's cutoff, it gets
 * pruned away and the search can dead-end with a non-empty but ultimately unproductive beam.
 */
function* run(start: SolveState, goalCaves: Position[], limits: SearchLimits): Generator<SearchEvent, SearchResult> {
  const t0 = performance.now();
  const goalKeys = goalKeySet(goalCaves);
  const startKey = stateKey(start);

  if (isGoalState(start, goalKeys)) {
    return { solved: true, moves: 0, actions: [], endReason: "solved" };
  }

  let currentLayer: LayerItem[] = [{ key: startKey, state: start, depth: 0 }];
  const visited = new Set<string>([startKey]);
  const prev = new Map<string, { p: string; a: string }>();
  let expandedCount = 0;

  while (currentLayer.length > 0) {
    const candidates: Candidate[] = [];

    for (const layerItem of currentLayer) {
      const now = performance.now();
      if (now - t0 > limits.maxMs) {
        return { solved: false, moves: null, actions: [], reason: `Timed out after ${Math.round(now - t0)}ms`, endReason: "timeout" };
      }
      if (expandedCount >= limits.maxExpansions) {
        return { solved: false, moves: null, actions: [], reason: `Expansion limit reached (${limits.maxExpansions})`, endReason: "node_limit" };
      }

      const { key, state, depth } = layerItem;
      expandedCount += 1;
      yield { type: "expand", stateKey: key, playerPos: state.playerPos, depth, g: depth, frontierSize: currentLayer.length };

      if (isGoalState(state, goalKeys)) {
        const actions = reconstructActions(prev, startKey, key);
        yield { type: "goal", stateKey: key, depth, actions };
        return { solved: true, moves: actions.length, actions, endReason: "solved" };
      }

      if (depth >= limits.maxDepth) continue;

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
        candidates.push({
          key: nk,
          state: succ.state,
          depth: depth + 1,
          h: manhattanToGoal(succ.state.playerPos, goalCaves),
          parentKey: key,
          actionString: succ.actionString,
          description: succ.description,
        });
      }
    }

    candidates.sort((a, b) => a.h - b.h);
    const kept = candidates.slice(0, BEAM_WIDTH);
    const pruned = candidates.slice(BEAM_WIDTH);

    for (const c of kept) {
      prev.set(c.key, { p: c.parentKey, a: c.actionString });
      yield {
        type: "generate",
        stateKey: c.key,
        parentKey: c.parentKey,
        actionString: c.actionString,
        description: c.description,
        playerPos: c.state.playerPos,
        depth: c.depth,
        g: c.depth,
        h: c.h,
        f: c.depth + c.h,
        frontierSize: candidates.length,
      };
    }
    for (const c of pruned) {
      yield {
        type: "reject",
        stateKey: c.key,
        parentKey: c.parentKey,
        actionString: c.actionString,
        description: c.description,
        playerPos: c.state.playerPos,
        reason: "beam-pruned",
      };
    }

    currentLayer = kept.map((c) => ({ key: c.key, state: c.state, depth: c.depth }));
  }

  return {
    solved: false,
    moves: null,
    actions: [],
    reason: `Beam emptied without reaching the goal (width ${BEAM_WIDTH}) — this is a real possible outcome for beam search, not just a limit timeout`,
    endReason: "exhausted",
  };
}

export const beamSearch: AlgorithmDescriptor = {
  id: "beamSearch",
  name: "Beam Search",
  shortDescription: `Greedy, but only the best ${BEAM_WIDTH} candidates survive each layer — everything else is dropped for good.`,
  explanation:
    `Beam search expands states one layer at a time, like BFS — but at the end of every layer, it keeps only the ${BEAM_WIDTH} candidates that look closest to the goal (smallest h) and permanently discards the rest, no matter how many were generated. That caps both memory and time at a fixed size per layer, however wide the search would otherwise get. The cost is real: if the true shortest path ever needs a move that looks worse than the cutoff at that moment, it gets pruned away for good, and beam search can end with nothing left in the beam — unlike every other algorithm here, it isn't even guaranteed to find a solution that exists.`,
  equationsNote:
    "Same units as Greedy: h(n) is a tile-distance estimate, computed for every candidate generated in a layer and used only to rank them against each other. g(n) (depth) is tracked and shown, but doesn't affect which candidates survive the cut — only h(n) does.",
  usesHeuristic: true,
  optimalGuaranteed: false,
  frontierKind: "beam",
  pseudocode: [
    "beam ← [start]",
    "while beam not empty:",
    "  candidates ← []",
    "  for each node in beam:",
    "    if node is goal: return path",
    "    for each neighbor: candidates.push(neighbor with h)",
    `  beam ← the ${BEAM_WIDTH} candidates with smallest h; drop the rest`,
  ],
  realWorldUses: [
    "Sequence generation in NLP/speech systems (choosing the next likely word/token)",
    "Any large-branching-factor search where the frontier itself would otherwise blow up memory",
    "Real-time systems needing a hard, predictable per-step time/memory cap",
  ],
  advantages: [
    `Hard, predictable bound on memory and time — never more than ${BEAM_WIDTH} states carried per layer`,
    "Much faster than Greedy or BFS on large search spaces, since it prunes aggressively",
    "Tunable — widening the beam trades speed for a better chance of finding a solution",
  ],
  disadvantages: [
    "Not even guaranteed to find a solution that exists — a good path can be pruned away",
    "No optimality guarantee on top of that, the same as Greedy",
  ],
  run,
};
