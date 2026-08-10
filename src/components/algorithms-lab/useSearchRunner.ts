import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Position } from "@/game/types";
import type { SolveState } from "@/lib/solver/state";
import { replaySolutionActions } from "@/lib/solver/replay";
import { isGeneratorDone } from "@/lib/algorithms-lab";
import type { AlgorithmDescriptor, SearchEvent, SearchLimits, SearchResult, SearchStats } from "@/lib/algorithms-lab";

export type CellStatus = "visited" | "frontier";

export interface CurrentNodeInfo {
  depth: number;
  g: number;
  h?: number;
  f?: number;
  /** Simulated Annealing only. */
  temperature?: number;
}

export interface SearchRunnerState {
  stats: SearchStats;
  /** Cell key "x,y" -> status. Bounded by grid size, never by generated-state count. */
  overlay: Map<string, CellStatus>;
  currentPos: Position | null;
  /** g(n)/h(n)/f(n) of the state most recently expanded, for the live heuristic readout. */
  currentNode: CurrentNodeInfo | null;
  /** Player positions along the found solution, in order (only set once solved). */
  solvedPath: Position[] | null;
  /** The raw action strings for the found solution (e.g. "P:R", "A(8,3):D"). */
  solvedActions: string[] | null;
  recentEvents: SearchEvent[];
  isRunning: boolean;
  isDone: boolean;
}

export interface SearchRunnerControls {
  play(): void;
  pause(): void;
  step(): void;
  reset(): void;
  runToEnd(): void;
  setSpeed(speed: number): void;
  speed: number;
}

const posKey = (p: Position) => `${p.x},${p.y}`;
const RECENT_EVENTS_LIMIT = 200;
/** Every "tick" (rAF) pulls speed^1.8 .next() calls, so the slider feels roughly exponential
 *  (fine-grained single-stepping at low speeds, fast enough to finish a ~70k-state search in a
 *  few seconds at high speeds) without ever draining the whole generator synchronously in one
 *  go — see AlgorithmsLab plan notes on why that matters for level 8-scale searches. */
const batchSizeForSpeed = (speed: number) => Math.max(1, Math.round(Math.pow(speed, 1.8)));

function estimateBytesPerState(start: SolveState): number {
  const rows = start.grid.length;
  const cols = start.grid[0]?.length ?? 0;
  // Two cloned grids (grid + baseGrid) of numbers, plus small object/Map overhead per state.
  return rows * cols * 2 * 8 + 320;
}

function initialStats(optimalGuaranteed: boolean): SearchStats {
  return {
    expanded: 0,
    generated: 0,
    rejected: 0,
    frontierSize: 0,
    maxFrontierSize: 0,
    elapsedMs: 0,
    currentDepth: 0,
    solved: null,
    moves: null,
    endReason: null,
    optimalGuaranteed,
    approxMemoryBytes: 0,
  };
}

/**
 * Drives one AlgorithmDescriptor's generator against one level, exposing play/pause/step/reset
 * controls plus incrementally-updated stats and a grid-sized visualization overlay. Never
 * retains the full event history or full SolveState objects — only a bounded ring buffer of
 * recent events and a cell-keyed overlay map, so this stays cheap even across the ~70k-state
 * level 8 search the Algorithms Lab is explicitly built to make tangible.
 */
export function useSearchRunner(
  algorithm: AlgorithmDescriptor,
  start: SolveState,
  goalCaves: Position[],
  limits: SearchLimits,
): SearchRunnerState & SearchRunnerControls {
  const bytesPerState = useMemo(() => estimateBytesPerState(start), [start]);

  const genRef = useRef<Generator<SearchEvent, SearchResult> | null>(null);
  const statsRef = useRef<SearchStats>(initialStats(algorithm.optimalGuaranteed));
  const overlayRef = useRef<Map<string, CellStatus>>(new Map());
  const currentPosRef = useRef<Position | null>(null);
  const currentNodeRef = useRef<CurrentNodeInfo | null>(null);
  const solvedPathRef = useRef<Position[] | null>(null);
  const solvedActionsRef = useRef<string[] | null>(null);
  const recentEventsRef = useRef<SearchEvent[]>([]);
  const doneRef = useRef(false);
  const runningRef = useRef(false);
  const startTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const speedRef = useRef(4);
  const [speedState, setSpeedState] = useState(4);

  // The refs above are the generator-draining engine's working storage, mutated in place for
  // cheap per-event updates. React state should never alias them directly (mutation wouldn't be
  // observed), so every render exposes an immutable snapshot copy instead — cheap since it's
  // bounded by grid size / a 200-event ring buffer, never by total generated-state count.
  const buildSnapshot = useCallback(
    (): SearchRunnerState => ({
      stats: { ...statsRef.current },
      overlay: new Map(overlayRef.current),
      currentPos: currentPosRef.current,
      currentNode: currentNodeRef.current,
      solvedPath: solvedPathRef.current,
      solvedActions: solvedActionsRef.current,
      recentEvents: recentEventsRef.current.slice(),
      isRunning: runningRef.current,
      isDone: doneRef.current,
    }),
    [],
  );

  const [snapshot, setSnapshot] = useState<SearchRunnerState>(buildSnapshot);
  const rerender = useCallback(() => setSnapshot(buildSnapshot()), [buildSnapshot]);

  const resetInternal = useCallback(() => {
    genRef.current = algorithm.run(start, goalCaves, limits);
    statsRef.current = initialStats(algorithm.optimalGuaranteed);
    overlayRef.current = new Map();
    currentPosRef.current = null;
    currentNodeRef.current = null;
    solvedPathRef.current = null;
    solvedActionsRef.current = null;
    recentEventsRef.current = [];
    doneRef.current = false;
    runningRef.current = false;
    startTimeRef.current = 0;
  }, [algorithm, start, goalCaves, limits]);

  // Re-initialize whenever the algorithm, level, or limits change.
  useEffect(() => {
    resetInternal();
    rerender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [algorithm, start, goalCaves, limits]);

  const pushEvent = useCallback((event: SearchEvent) => {
    const list = recentEventsRef.current;
    list.push(event);
    if (list.length > RECENT_EVENTS_LIMIT) list.shift();
  }, []);

  const applyEvent = useCallback(
    (event: SearchEvent) => {
      const stats = statsRef.current;
      const overlay = overlayRef.current;

      if (event.type === "generate") {
        stats.generated += 1;
        stats.frontierSize = event.frontierSize;
        stats.maxFrontierSize = Math.max(stats.maxFrontierSize, event.frontierSize);
        const key = posKey(event.playerPos);
        if (!overlay.has(key)) overlay.set(key, "frontier");
        pushEvent(event);
      } else if (event.type === "expand") {
        stats.expanded += 1;
        stats.frontierSize = event.frontierSize;
        stats.currentDepth = event.depth;
        const key = posKey(event.playerPos);
        overlay.set(key, "visited");
        currentPosRef.current = event.playerPos;
        currentNodeRef.current = { depth: event.depth, g: event.g, h: event.h, f: event.f, temperature: event.temperature };
        pushEvent(event);
      } else if (event.type === "reject") {
        stats.rejected += 1;
        pushEvent(event);
      } else if (event.type === "goal") {
        stats.solved = true;
        stats.moves = event.actions.length;
        stats.endReason = "solved";
        solvedActionsRef.current = event.actions;
        // Reuses the production solver's own replay utility to turn the found action list back
        // into a position trail, rather than re-deriving movement rules here.
        const frames = replaySolutionActions(start.grid, start.playerPos, event.actions);
        solvedPathRef.current = frames.map((f) => f.playerPos);
        pushEvent(event);
      }

      stats.approxMemoryBytes = stats.frontierSize * bytesPerState;
    },
    [bytesPerState, pushEvent, start.playerPos, start.grid],
  );

  const finish = useCallback((result: SearchResult) => {
    const stats = statsRef.current;
    stats.solved = result.solved;
    if (result.moves !== null) stats.moves = result.moves;
    stats.endReason = result.endReason;
    doneRef.current = true;
    runningRef.current = false;
  }, []);

  const pump = useCallback(
    (batchSize: number) => {
      const gen = genRef.current;
      if (!gen || doneRef.current) return;
      statsRef.current.elapsedMs = performance.now() - (startTimeRef.current || performance.now());
      for (let i = 0; i < batchSize; i += 1) {
        const step = gen.next();
        if (isGeneratorDone(step)) {
          finish(step.value);
          break;
        } else {
          applyEvent(step.value);
        }
      }
      statsRef.current.elapsedMs = performance.now() - startTimeRef.current;
    },
    [applyEvent, finish],
  );

  const tick = useCallback(() => {
    if (!runningRef.current) return;
    pump(batchSizeForSpeed(speedRef.current));
    rerender();
    if (!doneRef.current && runningRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [pump, rerender]);

  const play = useCallback(() => {
    if (doneRef.current || runningRef.current) return;
    if (!startTimeRef.current) startTimeRef.current = performance.now() - statsRef.current.elapsedMs;
    runningRef.current = true;
    rerender();
    rafRef.current = requestAnimationFrame(tick);
  }, [rerender, tick]);

  const pause = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    rerender();
  }, [rerender]);

  const step = useCallback(() => {
    if (doneRef.current || runningRef.current) return;
    if (!startTimeRef.current) startTimeRef.current = performance.now() - statsRef.current.elapsedMs;
    pump(1);
    rerender();
  }, [pump, rerender]);

  const runToEnd = useCallback(() => {
    if (doneRef.current) return;
    pause();
    if (!startTimeRef.current) startTimeRef.current = performance.now();
    const chunk = () => {
      // Same yielding cadence philosophy as the production solver's own setTimeout(0) every
      // ~1500 expansions: never drain a level-8-scale search in a single synchronous burst.
      pump(2000);
      rerender();
      if (!doneRef.current) {
        rafRef.current = requestAnimationFrame(chunk);
      }
    };
    rafRef.current = requestAnimationFrame(chunk);
  }, [pause, pump, rerender]);

  const reset = useCallback(() => {
    pause();
    resetInternal();
    rerender();
  }, [pause, resetInternal, rerender]);

  const setSpeed = useCallback((next: number) => {
    speedRef.current = next;
    setSpeedState(next);
  }, []);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  return {
    ...snapshot,
    play,
    pause,
    step,
    reset,
    runToEnd,
    setSpeed,
    speed: speedState,
  };
}
