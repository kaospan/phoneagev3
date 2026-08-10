import { getAllLevels, isPlaceholderGrid } from "@/data/levels";
import { findGoalCaves } from "@/game/caves";
import type { CellType, KeyInventory, Position } from "@/game/types";
import { createEmptyTrace } from "./trace/trace";
import { generateSuccessors } from "./actions";
import type { Action, SolveState } from "./state";
import { cloneGrid, cloneInventory, cloneBreakables } from "./utils";
import { buildHeuristic } from "./heuristics";
import { stateKey } from "./state";
import type { SolveOptions, LevelSolution } from "./types";
import type { SolverTrace, TraceActionRecord, TraceNode } from "./trace/trace";

function fmtAction(a: Action): string {
  if (a.t === "P") return `P:${a.d}`;
  if (a.t === "T") return `T`;
  return `A(${a.x},${a.y}):${a.d}`;
}

interface QueueItem {
  k: string;
  s: SolveState;
  priority: number;
  distanceToGoal: number;
  seq: number;
}

class PriorityFrontier {
  private heap: QueueItem[] = [];
  private bfs = false;

  setBfs(value: boolean) {
    this.bfs = value;
  }

  get length() {
    return this.heap.length;
  }

  push(item: QueueItem) {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): QueueItem | undefined {
    const first = this.heap[0];
    const last = this.heap.pop();
    if (!first || !last) return first;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  private isBefore(a: QueueItem, b: QueueItem) {
    if (a.priority !== b.priority) return a.priority < b.priority;
    if (this.bfs) return a.seq < b.seq;
    if (a.distanceToGoal !== b.distanceToGoal) return a.distanceToGoal < b.distanceToGoal;
    return a.seq < b.seq;
  }

  private bubbleUp(index: number) {
    let i = index;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (!this.isBefore(this.heap[i], this.heap[parent])) break;
      [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
      i = parent;
    }
  }

  private bubbleDown(index: number) {
    let i = index;
    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;
      let best = i;
      if (left < this.heap.length && this.isBefore(this.heap[left], this.heap[best])) best = left;
      if (right < this.heap.length && this.isBefore(this.heap[right], this.heap[best])) best = right;
      if (best === i) break;
      [this.heap[i], this.heap[best]] = [this.heap[best], this.heap[i]];
      i = best;
    }
  }
}

export async function solveLevel(
  levelId: number,
  start: SolveState,
  goalCaves: Position[],
  opts: Required<Pick<SolveOptions, "maxMsPerLevel" | "maxNodesPerLevel" | "maxDepth">> & Pick<SolveOptions, "onProgress" | "trace" | "searchMode">
): Promise<LevelSolution> {
  const t0 = performance.now();
  const startKey = stateKey(start);
  const goalKeys = new Set(goalCaves.map((goal) => `${goal.x},${goal.y}`));
  // Teleport-aware: plain Manhattan distance can overestimate true remaining cost near a pad
  // (one teleport hop can cover far more than 1 Manhattan unit), which misguides A* into
  // exploring huge numbers of branches that look closer than they are. See heuristics.ts.
  const heuristic = buildHeuristic(start.grid, goalCaves);

  const trace = opts.trace ?? createEmptyTrace();
  if (opts.trace) {
    trace.levelId = levelId;
    trace.startStateId = 0;
    trace.nodes.clear();
    trace.generationOrder = [];
    trace.expansionOrder = [];
    trace.furthestStateId = 0;
    trace.lastExpandedStateId = null;
    trace.startGrid = cloneGrid(start.grid);
    trace.startPlayerPos = { ...start.playerPos };
    trace.startInventory = cloneInventory(start.inventory);
    trace.goalCaves = goalCaves.map((g) => ({ ...g }));
    trace.options = {
      maxMsPerLevel: opts.maxMsPerLevel,
      maxNodesPerLevel: opts.maxNodesPerLevel,
      maxDepth: opts.maxDepth,
    };
    trace.endReason = "exhausted";
    trace.nodesExpanded = 0;
    trace.statesGenerated = 0;
    trace.ms = 0;
    trace.collisions = [];
    trace.deadEnds = [];
    trace.nodes.set(0, {
      id: 0,
      parentId: null,
      action: "Start",
      stateKey: startKey,
      playerPos: { ...start.playerPos },
      inventory: cloneInventory(start.inventory),
      grid: cloneGrid(start.grid),
      baseGrid: cloneGrid(start.baseGrid),
      breakableRockStates: cloneBreakables(start.breakableRockStates),
      depth: 0,
      expansionOrder: undefined,
      attemptedActions: [],
      distanceToGoal: heuristic(start.playerPos),
    });
    trace.generationOrder.push(0);
  }

  const prev = new Map<string, { p: string; a: Action }>();
  const depth = new Map<string, number>();
  const expanded = new Set<string>();
  const frontier = new PriorityFrontier();
  if (opts.searchMode === "bfs") frontier.setBfs(true);
  let queueSeq = 0;
  const startDistance = heuristic(start.playerPos);
  const startPriority = opts.searchMode === "bfs" ? 0 : startDistance;
  frontier.push({
    k: startKey,
    s: start,
    priority: startPriority,
    distanceToGoal: startDistance,
    seq: queueSeq++,
  });
  depth.set(startKey, 0);

  let nodesExpanded = 0;
  let nextId = opts.trace ? 1 : 0;
  const stateIdByKey = new Map<string, number>();
  if (opts.trace) stateIdByKey.set(startKey, 0);

  const isGoal = (s: SolveState) => goalKeys.has(`${s.playerPos.x},${s.playerPos.y}`);

  if (isGoal(start)) {
    if (opts.trace) trace.endReason = "solved";
    return {
      levelId,
      solved: true,
      moves: 0,
      actions: [],
      nodesExpanded: 0,
      ms: 0,
      trace: opts.trace,
    };
  }

  while (frontier.length > 0) {
    const now = performance.now();
    if (now - t0 > opts.maxMsPerLevel) {
      if (opts.trace) trace.endReason = "timeout";
      return {
        levelId,
        solved: false,
        moves: null,
        actions: [],
        reason: `Timed out after ${Math.round(now - t0)}ms (expanded ${nodesExpanded} nodes)`,
        nodesExpanded,
        ms: Math.round(now - t0),
        trace: opts.trace,
      };
    }
    if (nodesExpanded >= opts.maxNodesPerLevel) {
      if (opts.trace) trace.endReason = "node_limit";
      return {
        levelId,
        solved: false,
        moves: null,
        actions: [],
        reason: `Node limit reached (${opts.maxNodesPerLevel})`,
        nodesExpanded,
        ms: Math.round(now - t0),
        trace: opts.trace,
      };
    }

    const item = frontier.pop();
    if (!item) break;
    const { k, s } = item;
    if (expanded.has(k)) continue;
    expanded.add(k);
    const d0 = depth.get(k) ?? 0;
    if (d0 >= opts.maxDepth) {
      if (opts.trace) trace.endReason = "depth_limit";
      continue;
    }

    nodesExpanded += 1;
    const expansionOrder = nodesExpanded;

    let currentNodeId: number | null = null;
    if (opts.trace) {
      trace.nodesExpanded = nodesExpanded;
      const existingId = stateIdByKey.get(k);
      if (existingId === undefined) {
        trace.lastExpandedStateId = null;
        continue;
      }
      currentNodeId = existingId;
      trace.lastExpandedStateId = currentNodeId;
      const node = trace.nodes.get(currentNodeId);
      if (node) {
        node.expansionOrder = expansionOrder;
        if (trace.furthestStateId === null || node.depth > (trace.nodes.get(trace.furthestStateId)?.depth ?? -1)) {
          trace.furthestStateId = currentNodeId;
        }
      }
      trace.expansionOrder.push(currentNodeId);
    }

    if (opts.onProgress && nodesExpanded % 2000 === 0) {
      opts.onProgress(`Level ${levelId}: expanded ${nodesExpanded} (queue ${frontier.length})`);
    }

    if (nodesExpanded % 1500 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }

    const attemptedActions: TraceActionRecord[] = [];
    let acceptedMoves = 0;

    for (const succ of generateSuccessors(s)) {
      const nk = stateKey(succ.state);
      if (expanded.has(nk)) {
        attemptedActions.push({
          description: succ.description,
          actionString: succ.actionString,
          accepted: false,
          rejectionReason: "Already visited",
        });
        if (opts.trace) {
          const existingId = stateIdByKey.get(nk);
          if (existingId !== undefined) {
            trace.collisions.push({
              fromNode: currentNodeId ?? 0,
              toNode: existingId,
              actionString: succ.actionString,
            });
          }
        }
        continue;
      }

      const nd = d0 + 1;
      const prevDepth = depth.get(nk);
      if (prevDepth !== undefined && prevDepth <= nd) {
        attemptedActions.push({
          description: succ.description,
          actionString: succ.actionString,
          accepted: false,
          rejectionReason: "Already visited",
        });
        if (opts.trace) {
          const existingId = stateIdByKey.get(nk);
          if (existingId !== undefined) {
            trace.collisions.push({
              fromNode: currentNodeId ?? 0,
              toNode: existingId,
              actionString: succ.actionString,
            });
          }
        }
        continue;
      }

      depth.set(nk, nd);
      prev.set(nk, { p: k, a: succ.action });

      if (opts.trace) {
        opts.trace.statesGenerated += 1;
        const childNodeId = nextId;
        nextId += 1;
        stateIdByKey.set(nk, childNodeId);
        trace.generationOrder.push(childNodeId);
        trace.nodes.set(childNodeId, {
          id: childNodeId,
          parentId: currentNodeId ?? null,
          action: succ.actionString,
          stateKey: nk,
          playerPos: { ...succ.state.playerPos },
          inventory: cloneInventory(succ.state.inventory),
          grid: cloneGrid(succ.state.grid),
          baseGrid: cloneGrid(succ.state.baseGrid),
          breakableRockStates: cloneBreakables(succ.state.breakableRockStates),
          depth: nd,
          expansionOrder: undefined,
          attemptedActions: [],
          distanceToGoal: heuristic(succ.state.playerPos),
        });
        const parentNode = currentNodeId !== null ? trace.nodes.get(currentNodeId) : undefined;
        if (parentNode) {
          parentNode.attemptedActions = attemptedActions;
          parentNode.attemptedActions.push({
            description: succ.description,
            actionString: succ.actionString,
            accepted: true,
            resultStateId: childNodeId,
          });
        }
      }

      if (isGoal(succ.state)) {
        const actions: string[] = [];
        let cur = nk;
        while (cur !== startKey) {
          const link = prev.get(cur);
          if (!link) break;
          actions.push(fmtAction(link.a));
          cur = link.p;
        }
        actions.reverse();
        if (opts.trace) trace.endReason = "solved";
        return {
          levelId,
          solved: true,
          moves: actions.length,
          actions,
          nodesExpanded,
          ms: Math.round(performance.now() - t0),
          trace: opts.trace,
        };
      }
      const distanceToGoal = heuristic(succ.state.playerPos);
      const priority = opts.searchMode === "bfs" ? nd : nd + distanceToGoal;
      frontier.push({
        k: nk,
        s: succ.state,
        priority,
        distanceToGoal,
        seq: queueSeq++,
      });
      acceptedMoves += 1;
    }

    if (opts.trace && acceptedMoves === 0 && currentNodeId !== null) {
      const node = trace.nodes.get(currentNodeId);
      if (node && !node.attemptedActions.some((a) => a.accepted)) {
        trace.deadEnds.push(currentNodeId);
      }
    }
  }

  if (opts.trace) trace.endReason = "exhausted";

  return {
    levelId,
    solved: false,
    moves: null,
    actions: [],
    reason: "No solution found (search exhausted)",
    nodesExpanded,
    ms: Math.round(performance.now() - t0),
    trace: opts.trace,
  };
}
