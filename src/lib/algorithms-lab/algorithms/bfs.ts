import type { Position } from "@/game/types";
import { generateSuccessors } from "@/lib/solver/actions";
import type { SolveState } from "@/lib/solver/state";
import { stateKey } from "@/lib/solver/state";
import { FifoQueue } from "../frontier";
import type { AlgorithmDescriptor, SearchEvent, SearchLimits, SearchResult } from "../types";
import { goalKeySet, isGoalState, reconstructActions } from "./shared";

interface QueueItem {
  key: string;
  state: SolveState;
  depth: number;
}

function* run(start: SolveState, goalCaves: Position[], limits: SearchLimits): Generator<SearchEvent, SearchResult> {
  const t0 = performance.now();
  const goalKeys = goalKeySet(goalCaves);
  const startKey = stateKey(start);

  if (isGoalState(start, goalKeys)) {
    return { solved: true, moves: 0, actions: [], endReason: "solved" };
  }

  const frontier = new FifoQueue<QueueItem>();
  const visited = new Set<string>([startKey]);
  const prev = new Map<string, { p: string; a: string }>();
  frontier.push({ key: startKey, state: start, depth: 0 });

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

    const item = frontier.shift();
    if (!item) break;
    const { key, state, depth } = item;

    if (depth >= limits.maxDepth) {
      depthLimitSkips += 1;
      continue;
    }

    expanded += 1;
    yield { type: "expand", stateKey: key, playerPos: state.playerPos, depth, g: depth, frontierSize: frontier.length };

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
      prev.set(nk, { p: key, a: succ.actionString });

      if (isGoalState(succ.state, goalKeys)) {
        const actions = reconstructActions(prev, startKey, nk);
        yield { type: "goal", stateKey: nk, depth: nd, actions };
        return { solved: true, moves: actions.length, actions, endReason: "solved" };
      }

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

  return {
    solved: false,
    moves: null,
    actions: [],
    reason: "No solution found (search exhausted)",
    endReason: depthLimitSkips > 0 ? "depth_limit" : "exhausted",
  };
}

export const bfs: AlgorithmDescriptor = {
  id: "bfs",
  name: "Breadth-First Search",
  shortDescription: "Explores every state one move away, then two moves away, and so on.",
  explanation:
    "BFS explores states in layers. It completely explores every state reachable in 1 move, then every state reachable in 2 moves, then 3, and so on. Because it never looks further before looking closer, the first time it reaches the goal is guaranteed to be via the shortest possible path — but it may expand a huge number of states to get there, since it has no sense of direction toward the goal.",
  equationsNote:
    "g(n) counts actions taken so far — one edge in the search graph, which here is always exactly one player move or one remote-arrow trigger. BFS uses no heuristic, so there's no h(n) or f(n) — just g(n), which happens to equal the search depth exactly.",
  usesHeuristic: false,
  optimalGuaranteed: true,
  frontierKind: "queue",
  pseudocode: [
    "queue ← [start]",
    "while queue not empty:",
    "  node ← queue.popFront()",
    "  if node is goal: return path",
    "  for each neighbor of node:",
    "    if not visited: mark visited; queue.pushBack(neighbor)",
  ],
  realWorldUses: [
    "Shortest routes in unweighted graphs and mazes",
    "Web crawlers that index a site level by level",
    "“Degrees of separation” on social networks (e.g. friend-of-friend search)",
    "Network broadcast / flood-fill algorithms",
  ],
  advantages: [
    "Always finds the shortest solution — a hard guarantee, not a likelihood",
    "Simple to reason about: no heuristic to design or tune",
    "Complete — if a solution exists within the search limits, BFS will find it",
  ],
  disadvantages: [
    "No sense of direction toward the goal, so it can expand a huge number of states",
    "Memory-hungry — the whole frontier (often very wide) has to stay in memory at once",
  ],
  run,
};
