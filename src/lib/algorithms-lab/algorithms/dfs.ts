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

function* run(start: SolveState, goalCaves: Position[], limits: SearchLimits): Generator<SearchEvent, SearchResult> {
  const t0 = performance.now();
  const goalKeys = goalKeySet(goalCaves);
  const startKey = stateKey(start);

  if (isGoalState(start, goalKeys)) {
    return { solved: true, moves: 0, actions: [], endReason: "solved" };
  }

  const frontier = new LifoStack<StackItem>();
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

    const item = frontier.pop();
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

export const dfs: AlgorithmDescriptor = {
  id: "dfs",
  name: "Depth-First Search",
  shortDescription: "Commits to one path as deep as it can go before backtracking.",
  explanation:
    "DFS commits to one path as deep as possible before backtracking. It picks a move, then a move from that state, then a move from that state, diving as deep as it can — only backing up once it hits a dead end. Because it never reconsiders a shallower alternative once it's gone deep, the path it finds can be far longer than necessary, and it can spend a long time wandering before it happens to stumble onto the goal.",
  equationsNote:
    "Same as BFS: g(n) is the number of actions taken so far, equal to depth. DFS uses no heuristic, so g(n) is the only number in play — but unlike BFS, a large g(n) here doesn't signal a problem; DFS commits to depth on purpose.",
  usesHeuristic: false,
  optimalGuaranteed: false,
  frontierKind: "stack",
  pseudocode: [
    "stack ← [start]",
    "while stack not empty:",
    "  node ← stack.pop()",
    "  if node is goal: return path",
    "  for each neighbor of node:",
    "    if not visited: mark visited; stack.push(neighbor)",
  ],
  realWorldUses: [
    "Maze and puzzle solving by exhaustive backtracking",
    "Detecting cycles in dependency graphs (build tools, package managers)",
    "Topological sorting (e.g. task/course scheduling)",
    "Walking file systems or nested object/DOM trees",
  ],
  advantages: [
    "Very low memory use — only the current path needs to be remembered, not a wide frontier",
    "Simple to implement, and fast when any working solution is acceptable",
    "Good fit when the goal is likely to be deep rather than shallow",
  ],
  disadvantages: [
    "No optimality guarantee — the solution found can be far longer than necessary",
    "Can wander deep into an unproductive branch for a long time before backtracking",
  ],
  run,
};
