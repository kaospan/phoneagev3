import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, SkipBack, SkipForward, RotateCcw, Loader2 } from 'lucide-react';
import { useLevelMapper } from '@/components/level-mapper/useLevelMapper';
import { GameTop2D } from '@/components/GameTop2D';
import { LevelThumbnail } from './LevelThumbnail';
import { MapperPanelFrame, MapperMetricPill } from './MapperChrome';
import {
  runSolveLevel,
  replaySolutionActions,
  generateSolverTraceHTML,
  createEmptyTrace,
  type LevelSolution,
  type SolutionFrame,
  type SolverTrace,
} from '@/lib/levelSolver';
import type { CellType } from '@/game/types';
import { cn } from '@/lib/utils';

// Levels 1-100 were captured from the original DOS game's screenshots; 101-200 are
// procedurally generated. The split matters here because it's the whole point of this view —
// letting the two ranges be compared side by side by move-count / structure.
const PROCEDURAL_LEVEL_START = 101;

type SolveStatus = 'unattempted' | 'solving' | 'solved' | 'unsolved' | 'error';
interface SolveEntry {
  status: SolveStatus;
  solution?: LevelSolution;
  error?: string;
}

type ModeKey = 'astar' | 'bfs';
type ModeSolveStatus = Record<ModeKey, SolveEntry>;

type SolutionsPage = 'browser' | 'logs';
type ScopeFilter = 'all' | 'original' | 'procedural';

interface SolverLogEntry {
  id: string;
  levelId: number;
  status: Exclude<SolveStatus, 'unattempted' | 'solving'>;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  solved: boolean;
  moves: number | null;
  reason: string;
  nodesExpanded: number;
  statesGenerated: number;
  endReason: string;
  collisions: number;
  deadEnds: number;
  options: {
    maxMsPerLevel: number;
    maxNodesPerLevel: number;
    maxDepth: number;
  };
  searchMode: 'astar' | 'bfs';
  moveHistory: string[];
  details: string[];
  traceAvailable: boolean;
  error?: string;
}

const SINGLE_SOLVE_OPTS = { maxMsPerLevel: 6000, maxNodesPerLevel: 80_000, maxDepth: 220 };
const BATCH_SOLVE_OPTS = { maxMsPerLevel: 2000, maxNodesPerLevel: 20_000, maxDepth: 160 };
const PLAYBACK_INTERVAL_MS = 550;
const PLAYBACK_SPEED_MIN = 0.25;
const PLAYBACK_SPEED_MAX = 3;
const PLAYBACK_SPEED_STEP = 0.25;
const SOLVER_LOG_STORAGE_KEY = 'phoneage:mapper-solver-logs:v1';
const MAX_SOLVER_LOG_ENTRIES = 500;

const statusStyle: Record<SolveStatus, string> = {
  unattempted: 'border-white/10 bg-white/[0.04] text-stone-400',
  solving: 'border-sky-300/30 bg-sky-500/10 text-sky-100',
  solved: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100',
  unsolved: 'border-red-300/30 bg-red-500/10 text-red-100',
  error: 'border-amber-300/30 bg-amber-500/10 text-amber-100',
};

const statusLabel = (entry: SolveEntry | undefined): string => {
  if (!entry || entry.status === 'unattempted') return 'Not solved yet';
  if (entry.status === 'solving') return 'Solving…';
  if (entry.status === 'solved') return `${entry.solution?.moves ?? '?'} moves`;
  if (entry.status === 'error') return 'Solver error';
  return entry.solution?.reason ?? 'Unsolved';
};

const createLogId = (levelId: number, startedAt: string) =>
  `solver-log-${levelId}-${startedAt}-${Math.random().toString(36).slice(2, 8)}`;

const formatLogTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

const loadSolverLogs = (): SolverLogEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SOLVER_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveSolverLogs = (logs: SolverLogEntry[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOLVER_LOG_STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_SOLVER_LOG_ENTRIES)));
  } catch {
    // The UI still keeps the in-memory log if localStorage is full or unavailable.
  }
};

const createTraceFilename = (levelId: number | null | undefined, suffix = 'trace') => {
  const safeLevel = Number.isFinite(levelId) ? levelId : 'unknown';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `phoneage-level-${safeLevel}-${suffix}-${stamp}.html`;
};

const tracePathToNode = (trace: SolverTrace, nodeId: number | null): string[] => {
  if (nodeId == null) return [];
  const path: string[] = [];
  let cur: number | null | undefined = nodeId;
  while (cur != null && cur !== trace.startStateId) {
    const node = trace.nodes.get(cur);
    if (!node) break;
    path.unshift(node.action);
    cur = node.parentId;
  }
  return path;
};

const traceFocusNodeId = (trace: SolverTrace): number | null =>
  trace.lastExpandedStateId ?? trace.furthestStateId ?? trace.startStateId ?? null;

const traceDetails = (trace: SolverTrace): string[] => {
  const nodeId = traceFocusNodeId(trace);
  const node = nodeId != null ? trace.nodes.get(nodeId) : undefined;
  const lines = [
    `End reason: ${trace.endReason}`,
    `Nodes expanded: ${trace.nodesExpanded}`,
    `States generated: ${trace.statesGenerated}`,
    `Closest Manhattan distance: ${Number.isFinite(trace.closestManhattan) ? trace.closestManhattan : 'unknown'}`,
    `Collisions: ${trace.collisions.length}`,
    `Dead ends: ${trace.deadEnds.length}`,
  ];
  if (!node) return lines;
  lines.push(`Focus state: #${node.id}`);
  lines.push(`Depth: ${node.depth}`);
  lines.push(`Player: ${node.playerPos.x},${node.playerPos.y}`);
  lines.push(`Inventory: red ${node.inventory.red}, green ${node.inventory.green}`);
  if (node.attemptedActions.length > 0) {
    for (const action of node.attemptedActions.slice(0, 80)) {
      lines.push(
        `${action.accepted ? 'accepted' : 'rejected'} ${action.actionString}: ${action.description}${
          action.rejectionReason ? ` (${action.rejectionReason})` : ''
        }`,
      );
    }
    if (node.attemptedActions.length > 80) {
      lines.push(`... ${node.attemptedActions.length - 80} more attempted moves omitted from this compact log`);
    }
  }
  return lines;
};

const buildSolverLogEntry = (
  levelId: number,
  startedAt: string,
  finishedAt: string,
  result: LevelSolution | null,
  error: Error | null,
  trace: SolverTrace | null,
  options: typeof SINGLE_SOLVE_OPTS,
  searchMode: 'astar' | 'bfs',
): SolverLogEntry => {
  const status: SolverLogEntry['status'] = error ? 'error' : result?.solved ? 'solved' : 'unsolved';
  const focusPath = trace ? tracePathToNode(trace, traceFocusNodeId(trace)) : [];
  const moveHistory = result?.solved ? result.actions : focusPath;
  return {
    id: createLogId(levelId, startedAt),
    levelId,
    status,
    startedAt,
    finishedAt,
    durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
    solved: Boolean(result?.solved),
    moves: result?.moves ?? (moveHistory.length > 0 ? moveHistory.length : null),
    reason: error?.message ?? result?.reason ?? (result?.solved ? 'Solved' : 'Unknown solver result'),
    nodesExpanded: result?.nodesExpanded ?? trace?.nodesExpanded ?? 0,
    statesGenerated: trace?.statesGenerated ?? 0,
    endReason: trace?.endReason ?? (error ? 'error' : 'unknown'),
    collisions: trace?.collisions.length ?? 0,
    deadEnds: trace?.deadEnds.length ?? 0,
    options,
    searchMode,
    moveHistory,
    details: trace ? traceDetails(trace) : [error?.stack ?? error?.message ?? 'No trace was produced.'],
    traceAvailable: Boolean(trace && trace.nodes.size > 0),
    error: error?.message,
  };
};

export const LevelSolutionsBrowser: React.FC = () => {
  const { allLevels } = useLevelMapper();

  const [selectedId, setSelectedId] = useState<number | null>(allLevels[0]?.id ?? null);
  const [solveStatus, setSolveStatus] = useState<Record<number, ModeSolveStatus>>({});
  const [page, setPage] = useState<SolutionsPage>('browser');
  const [solverLogs, setSolverLogs] = useState<SolverLogEntry[]>(loadSolverLogs);
  const [selectedMode, setSelectedMode] = useState<ModeKey>('astar');
  const [batchMode, setBatchMode] = useState<ModeKey>('astar');
  const logTraceRef = useRef<Map<string, SolverTrace>>(new Map());
  const solveStatusRef = useRef(solveStatus);
  useEffect(() => {
    solveStatusRef.current = solveStatus;
  }, [solveStatus]);

  const [scope, setScope] = useState<ScopeFilter>('all');
  const [unsolvedOnly, setUnsolvedOnly] = useState(false);
  const [search, setSearch] = useState('');

  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const batchCancelRef = useRef(false);

  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    saveSolverLogs(solverLogs);
  }, [solverLogs]);

  const appendSolverLog = useCallback((entry: SolverLogEntry, trace: SolverTrace | null) => {
    if (trace && trace.nodes.size > 0) logTraceRef.current.set(entry.id, trace);
    setSolverLogs((prev) => [entry, ...prev].slice(0, MAX_SOLVER_LOG_ENTRIES));
  }, []);

  const downloadTrace = useCallback((trace: SolverTrace, suffix = 'trace') => {
    const html = generateSolverTraceHTML(trace);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = createTraceFilename(trace.levelId ?? null, suffix);
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, []);

  const solveOne = useCallback(async (id: number, mode: ModeKey) => {
    setSolveStatus((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), [mode]: { status: 'solving' } },
    }));
    const startedAt = new Date().toISOString();
    const trace = createEmptyTrace();
    try {
      const result = await runSolveLevel(id, { ...SINGLE_SOLVE_OPTS, trace, searchMode: mode });
      const finishedAt = new Date().toISOString();
      setSolveStatus((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? {}), [mode]: { status: result.solved ? 'solved' : 'unsolved', solution: result } },
      }));
      appendSolverLog(buildSolverLogEntry(id, startedAt, finishedAt, result, null, result.trace ?? trace, SINGLE_SOLVE_OPTS, mode), result.trace ?? trace);
      if (!result.solved && result.trace) {
        downloadTrace(result.trace, 'unsolved');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const finishedAt = new Date().toISOString();
      setSolveStatus((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? {}), [mode]: { status: 'error', error: error.message } },
      }));
      appendSolverLog(buildSolverLogEntry(id, startedAt, finishedAt, null, error, trace, SINGLE_SOLVE_OPTS, mode), trace);
    }
  }, [appendSolverLog, downloadTrace]);

  const filteredLevels = useMemo(() => {
    const q = search.trim();
    const qNum = q ? Number(q) : null;
    return allLevels.filter((lvl) => {
      if (scope === 'original' && lvl.id >= PROCEDURAL_LEVEL_START) return false;
      if (scope === 'procedural' && lvl.id < PROCEDURAL_LEVEL_START) return false;
      if (unsolvedOnly) {
        const modes = solveStatus[lvl.id];
        const anySolved = modes ? [modes.astar, modes.bfs].some((e) => e?.status === 'solved') : false;
        if (anySolved) return false;
      }
      if (q && Number.isFinite(qNum)) {
        return String(lvl.id).includes(q);
      }
      return true;
    });
  }, [allLevels, scope, unsolvedOnly, search, solveStatus]);

  const scopeStats = useMemo(() => {
    const moves: number[] = [];
    let solvedCount = 0;
    let attemptedCount = 0;
    for (const lvl of filteredLevels) {
      const modes = solveStatus[lvl.id];
      if (!modes) continue;
      const entries = [modes.astar, modes.bfs].filter(Boolean) as SolveEntry[];
      if (entries.length === 0) continue;
      attemptedCount += 1;
      const solved = entries.filter((e) => e.status === 'solved' && e.solution?.moves != null);
      if (solved.length > 0) {
        solvedCount += 1;
        moves.push(Math.min(...solved.map((e) => e.solution!.moves!)));
      }
    }
    const avg = moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : null;
    return {
      attemptedCount,
      solvedCount,
      total: filteredLevels.length,
      min: moves.length ? Math.min(...moves) : null,
      max: moves.length ? Math.max(...moves) : null,
      avg,
    };
  }, [filteredLevels, solveStatus]);

  const runBatch = useCallback(
    async (ids: number[], mode: ModeKey) => {
      batchCancelRef.current = false;
      setBatchRunning(true);
      setBatchProgress({ done: 0, total: ids.length });
      let done = 0;
      for (const id of ids) {
        if (batchCancelRef.current) break;
        const existing = solveStatusRef.current[id]?.[mode]?.status;
        if (existing !== 'solved') {
          setSolveStatus((prev) => ({
            ...prev,
            [id]: { ...(prev[id] ?? {}), [mode]: { status: 'solving' } },
          }));
          const startedAt = new Date().toISOString();
          const trace = createEmptyTrace();
          try {
            const result = await runSolveLevel(id, { ...BATCH_SOLVE_OPTS, trace, searchMode: mode });
            const finishedAt = new Date().toISOString();
            setSolveStatus((prev) => ({
              ...prev,
              [id]: { ...(prev[id] ?? {}), [mode]: { status: result.solved ? 'solved' : 'unsolved', solution: result } },
            }));
            appendSolverLog(buildSolverLogEntry(id, startedAt, finishedAt, result, null, result.trace ?? trace, BATCH_SOLVE_OPTS, mode), result.trace ?? trace);
            if (!result.solved && result.trace) {
              downloadTrace(result.trace, 'unsolved');
            }
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            const finishedAt = new Date().toISOString();
            setSolveStatus((prev) => ({
              ...prev,
              [id]: { ...(prev[id] ?? {}), [mode]: { status: 'error', error: error.message } },
            }));
            appendSolverLog(buildSolverLogEntry(id, startedAt, finishedAt, null, error, trace, BATCH_SOLVE_OPTS, mode), trace);
          }
        }
        done += 1;
        setBatchProgress({ done, total: ids.length });
        await new Promise(requestAnimationFrame);
      }
      setBatchRunning(false);
    },
    [appendSolverLog, downloadTrace],
  );

  const selectedLevel = useMemo(
    () => allLevels.find((lvl) => lvl.id === selectedId) ?? null,
    [allLevels, selectedId],
  );
  const selectedEntry = selectedId != null ? solveStatus[selectedId]?.[selectedMode] : undefined;
  const selectedFilteredIndex = useMemo(
    () => filteredLevels.findIndex((lvl) => lvl.id === selectedId),
    [filteredLevels, selectedId],
  );
  const previousLevel = selectedFilteredIndex > 0 ? filteredLevels[selectedFilteredIndex - 1] : null;
  const nextLevel =
    selectedFilteredIndex >= 0 && selectedFilteredIndex < filteredLevels.length - 1
      ? filteredLevels[selectedFilteredIndex + 1]
      : null;
  const selectLevelId = useCallback((id: number) => {
    setSelectedId(id);
  }, []);

  const frames: SolutionFrame[] = useMemo(() => {
    if (!selectedLevel || !selectedEntry?.solution?.solved) return [];
    return replaySolutionActions(
      selectedLevel.grid as CellType[][],
      selectedLevel.playerStart,
      selectedEntry.solution.actions,
    );
  }, [selectedLevel, selectedEntry]);

  useEffect(() => {
    setStepIndex(0);
    setPlaying(false);
  }, [selectedId, frames]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const id = window.setInterval(() => {
      setStepIndex((i) => {
        if (i >= frames.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, Math.max(50, Math.round(PLAYBACK_INTERVAL_MS / playbackSpeed)));
    return () => window.clearInterval(id);
  }, [playing, frames.length, playbackSpeed]);

  const adjustPlaybackSpeed = useCallback((delta: number) => {
    setPlaybackSpeed((speed) => {
      const next = Math.round((speed + delta) / PLAYBACK_SPEED_STEP) * PLAYBACK_SPEED_STEP;
      return Math.max(PLAYBACK_SPEED_MIN, Math.min(PLAYBACK_SPEED_MAX, Number(next.toFixed(2))));
    });
  }, []);

  const currentFrame = frames[Math.min(stepIndex, Math.max(0, frames.length - 1))] ?? null;
  const displayGrid = currentFrame ? currentFrame.grid : selectedLevel?.grid ?? null;
  const displayPlayerPos = currentFrame ? currentFrame.playerPos : selectedLevel?.playerStart ?? null;
  const solverLogGroups = useMemo(() => {
    const groups = new Map<number, SolverLogEntry[]>();
    for (const log of solverLogs) {
      const rows = groups.get(log.levelId) ?? [];
      rows.push(log);
      groups.set(log.levelId, rows);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([levelId, entries]) => ({
        levelId,
        entries: entries.sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime()),
      }));
  }, [solverLogs]);
  const logCounts = useMemo(() => ({
    solved: solverLogs.filter((l) => l.status === 'solved').length,
    unsolved: solverLogs.filter((l) => l.status === 'unsolved').length,
    error: solverLogs.filter((l) => l.status === 'error').length,
  }), [solverLogs]);

  return (
    <div className="flex h-full min-h-0 w-full gap-3">
      {/* Level list */}
      <MapperPanelFrame className="w-[320px] shrink-0">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-white/10 px-3 py-3">
            <div className="text-sm font-semibold text-stone-50">Level Solutions</div>
            <div className="mt-0.5 text-[11px] leading-snug text-stone-400">
              Top-view preview + solved playthrough for every level.
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {(['browser', 'logs'] as SolutionsPage[]).map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setPage(target)}
                  className={cn(
                    'h-8 rounded-lg border px-2 text-[10px] font-black uppercase tracking-[0.12em] transition-colors',
                    page === target
                      ? 'border-sky-300/40 bg-sky-500/15 text-sky-100'
                      : 'border-white/10 bg-white/[0.04] text-stone-400 hover:text-stone-100',
                  )}
                >
                  {target === 'browser' ? 'Browser' : `Solver Log ${solverLogs.length ? `(${solverLogs.length})` : ''}`}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {(['all', 'original', 'procedural'] as ScopeFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    'rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] transition-colors',
                    scope === s
                      ? 'border-amber-300/40 bg-amber-500/15 text-amber-100'
                      : 'border-white/10 bg-white/[0.04] text-stone-400 hover:text-stone-100',
                  )}
                >
                  {s === 'all' ? 'All 1–200' : s === 'original' ? 'Original 1–100' : 'Procedural 101–200'}
                </button>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find level #"
                className="h-8 min-w-0 flex-1 rounded-xl border border-white/10 bg-stone-900/85 px-2.5 text-xs text-stone-100 [color-scheme:dark]"
              />
              <label className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                <input
                  type="checkbox"
                  checked={unsolvedOnly}
                  onChange={(e) => setUnsolvedOnly(e.target.checked)}
                />
                Unsolved
              </label>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <MapperMetricPill
                label="Solved"
                value={`${scopeStats.solvedCount}/${scopeStats.attemptedCount || scopeStats.total}`}
                tone="success"
              />
              <MapperMetricPill
                label="Avg Moves"
                value={scopeStats.avg != null ? scopeStats.avg.toFixed(1) : '—'}
                tone="info"
              />
              <MapperMetricPill
                label="Range"
                value={scopeStats.min != null ? `${scopeStats.min}–${scopeStats.max}` : '—'}
              />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-0.5">
                {(['astar', 'bfs'] as ModeKey[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setBatchMode(m)}
                    className={cn(
                      'h-7 rounded-lg px-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition-colors',
                      batchMode === m
                        ? 'bg-emerald-500/20 text-emerald-100'
                        : 'text-stone-400 hover:text-stone-100',
                    )}
                  >
                    {m === 'astar' ? 'A*' : 'BFS'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={batchRunning || filteredLevels.length === 0}
                onClick={() => {
                  const ids = filteredLevels.map((l) => l.id);
                  void runBatch(ids, batchMode);
                }}
                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-300/30 bg-emerald-500/15 px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {batchRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Solve {scope === 'all' ? 'All' : scope === 'original' ? '1–100' : '101–200'}
              </button>
              {batchRunning && (
                <button
                  type="button"
                  onClick={() => {
                    batchCancelRef.current = true;
                  }}
                  className="h-8 shrink-0 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-stone-200 hover:bg-white/[0.1]"
                >
                  Stop
                </button>
              )}
            </div>

            {batchRunning && (
              <div className="mt-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{
                      width: `${batchProgress.total ? (batchProgress.done / batchProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-stone-400">
                  {batchProgress.done}/{batchProgress.total} solved
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {filteredLevels.map((lvl) => {
              const modes = solveStatus[lvl.id];
              const isSelected = lvl.id === selectedId;
              const combined = modes
                ? [modes.astar, modes.bfs].filter(Boolean) as SolveEntry[]
                : [];
              const best = combined.find((e) => e.status === 'solved') ??
                combined.find((e) => e.status === 'solving') ??
                combined.find((e) => e.status === 'unsolved') ??
                combined.find((e) => e.status === 'error') ??
                undefined;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => selectLevelId(lvl.id)}
                  className={cn(
                    'mb-1.5 flex w-full items-center gap-2.5 rounded-xl border px-2 py-2 text-left transition-colors',
                    isSelected
                      ? 'border-amber-300/40 bg-amber-500/10'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]',
                  )}
                >
                  <LevelThumbnail
                    grid={lvl.grid}
                    cavePos={lvl.cavePos}
                    playerStart={lvl.playerStart}
                    width={64}
                    height={40}
                    className="shrink-0 rounded-lg border border-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-stone-100">
                      Level {lvl.id}
                      <span className="ml-1.5 text-[10px] font-normal text-stone-500">
                        {lvl.id < PROCEDURAL_LEVEL_START ? 'original' : 'procedural'}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'mt-0.5 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold',
                        statusStyle[best?.status ?? 'unattempted'],
                      )}
                    >
                      {best?.status === 'solving' && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
                      {best ? statusLabel(best) : 'Not solved yet'}
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredLevels.length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-stone-500">No levels match this filter.</div>
            )}
          </div>
        </div>
      </MapperPanelFrame>

      {/* Detail / playback */}
      <MapperPanelFrame className="min-w-0 flex-1">
        {page === 'logs' ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-stone-50">Solver Monitoring Log</div>
                <div className="mt-0.5 text-[11px] text-stone-500">
                  Timestamped solve runs grouped by level. Failed runs keep their move history and final-state details.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MapperMetricPill label="Solved" value={logCounts.solved} tone="success" />
                <MapperMetricPill label="Unsolved" value={logCounts.unsolved} tone="warning" />
                <MapperMetricPill label="Errors" value={logCounts.error} tone="warning" />
                <button
                  type="button"
                  disabled={solverLogs.length === 0}
                  onClick={() => {
                    if (!window.confirm('Clear all saved solver logs from this browser?')) return;
                    logTraceRef.current.clear();
                    setSolverLogs([]);
                  }}
                  className="h-8 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-stone-200 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear Logs
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {solverLogGroups.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-stone-500">
                  No solver logs yet. Run a single solve or batch solve to start recording.
                </div>
              ) : (
                <div className="space-y-4">
                  {solverLogGroups.map((group) => (
                    <section key={group.levelId}>
                      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-stone-950/95 py-2 backdrop-blur">
                        <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-300">Level {group.levelId}</div>
                        <div className="text-[10px] text-stone-500">{group.entries.length} run{group.entries.length === 1 ? '' : 's'}</div>
                      </div>
                      <div className="mt-2 space-y-2">
                        {group.entries.map((log) => {
                          const trace = logTraceRef.current.get(log.id);
                          return (
                            <div key={log.id} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={cn(
                                        'rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide',
                                        statusStyle[log.status],
                                      )}
                                    >
                                      {log.status}
                                    </span>
                                    <span className="font-semibold text-stone-100">{formatLogTime(log.finishedAt)}</span>
                                    <span className="text-stone-500">{Math.max(0, log.durationMs)}ms</span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-stone-400">
                                    <span>{log.moves ?? '—'} moves</span>
                                    <span>{log.nodesExpanded} expanded</span>
                                    <span>{log.statesGenerated} generated</span>
                                    <span>{log.endReason}</span>
                                  </div>
                                </div>
                                {trace ? (
                                  <button
                                    type="button"
                                    onClick={() => downloadTrace(trace, 'trace')}
                                    className="h-8 rounded-xl border border-amber-300/30 bg-amber-500/15 px-2.5 text-[10px] font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-500/25"
                                  >
                                    Download Trace
                                  </button>
                                ) : log.traceAvailable ? (
                                  <span className="text-[10px] text-stone-500">Full trace expired after reload</span>
                                ) : null}
                              </div>
                              <div className="mt-2 text-[11px] text-stone-400">{log.reason}</div>
                              <details className="mt-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                                <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.12em] text-stone-300">
                                  Move history and details
                                </summary>
                                <div className="mt-2 grid gap-3 md:grid-cols-2">
                                  <div>
                                    <div className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-stone-500">Move history</div>
                                    <div className="max-h-56 overflow-y-auto rounded-md bg-black/25 p-2 font-mono text-[11px] leading-relaxed text-stone-300">
                                      {log.moveHistory.length > 0 ? log.moveHistory.map((move, idx) => (
                                        <div key={`${log.id}-move-${idx}`}>
                                          {String(idx + 1).padStart(2, '0')}. {move}
                                        </div>
                                      )) : <div className="text-stone-500">No accepted moves were recorded.</div>}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-stone-500">Details</div>
                                    <div className="max-h-56 overflow-y-auto rounded-md bg-black/25 p-2 font-mono text-[11px] leading-relaxed text-stone-300">
                                      {log.details.map((line, idx) => (
                                        <div key={`${log.id}-detail-${idx}`}>{line}</div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-stone-500">
                                  <span>Started {formatLogTime(log.startedAt)}</span>
                                  <span>Limits {log.options.maxMsPerLevel}ms / {log.options.maxNodesPerLevel} nodes / depth {log.options.maxDepth}</span>
                                  <span>{log.collisions} collisions</span>
                                  <span>{log.deadEnds} dead ends</span>
                                </div>
                              </details>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : !selectedLevel ? (
          <div className="flex h-full items-center justify-center text-sm text-stone-500">
            Select a level to preview its solution.
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-stone-50">
                  Level {selectedLevel.id}
                  <span className="ml-2 text-xs font-normal text-stone-400">
                    {selectedLevel.id < PROCEDURAL_LEVEL_START
                      ? 'Original DOS level'
                      : 'Procedurally generated'}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-stone-500">
                  Board {selectedLevel.grid.length}×{selectedLevel.grid[0]?.length ?? 0}
                  {selectedLevel.theme ? ` · Theme ${selectedLevel.theme}` : ''}
                  {selectedLevel.timeLimitSeconds ? ` · ${selectedLevel.timeLimitSeconds}s timer` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!previousLevel}
                    onClick={() => {
                      if (previousLevel) selectLevelId(previousLevel.id);
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-stone-200 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
                    title={previousLevel ? `Previous: Level ${previousLevel.id}` : 'No previous level'}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={!nextLevel}
                    onClick={() => {
                      if (nextLevel) selectLevelId(nextLevel.id);
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-stone-200 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
                    title={nextLevel ? `Next: Level ${nextLevel.id}` : 'No next level'}
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-0.5">
                  {(['astar', 'bfs'] as ModeKey[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedMode(m)}
                      className={cn(
                        'h-7 rounded-lg px-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition-colors',
                        selectedMode === m
                          ? 'bg-sky-500/20 text-sky-100'
                          : 'text-stone-400 hover:text-stone-100',
                      )}
                    >
                      {m === 'astar' ? 'A*' : 'BFS'}
                    </button>
                  ))}
                </div>
                <div
                  className={cn(
                    'inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-bold',
                    statusStyle[selectedEntry?.status ?? 'unattempted'],
                  )}
                >
                  {statusLabel(selectedEntry)}
                </div>
                <button
                  type="button"
                  disabled={selectedEntry?.status === 'solving'}
                  onClick={() => void solveOne(selectedLevel.id, selectedMode)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-sky-300/30 bg-sky-500/15 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-sky-100 transition-colors hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selectedEntry?.status === 'solving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {selectedEntry?.solution ? 'Re-solve' : 'Solve'}
                </button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 bg-black">
              {displayGrid ? (
                <GameTop2D
                  grid={displayGrid}
                  cavePos={selectedLevel.cavePos}
                  playerStart={selectedLevel.playerStart}
                  selectedArrow={currentFrame?.arrowTo ?? null}
                  players={
                    displayPlayerPos
                      ? [
                          {
                            id: 'solver',
                            pos: displayPlayerPos,
                            facing: 'down',
                            color: '#22c55e',
                            isLocal: true,
                          },
                        ]
                      : []
                  }
                  theme={selectedLevel.theme}
                />
              ) : null}
            </div>

            <div className="border-t border-white/10 px-4 py-3">
              {frames.length > 0 ? (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setStepIndex(0);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-stone-200 hover:bg-white/[0.1]"
                      title="Restart"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setStepIndex((i) => Math.max(0, i - 1));
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-stone-200 hover:bg-white/[0.1]"
                      title="Previous step"
                    >
                      <SkipBack className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlaying((p) => !p)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
                      title={playing ? 'Pause' : 'Play'}
                    >
                      {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setStepIndex((i) => Math.min(frames.length - 1, i + 1));
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-stone-200 hover:bg-white/[0.1]"
                      title="Next step"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => adjustPlaybackSpeed(-PLAYBACK_SPEED_STEP)}
                      disabled={playbackSpeed <= PLAYBACK_SPEED_MIN}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] px-2 text-[10px] font-bold text-stone-200 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
                      title="Slow playback by 0.25x"
                    >
                      -0.25x
                    </button>
                    <div className="min-w-12 text-center text-[11px] font-black tabular-nums text-stone-200">
                      {playbackSpeed.toFixed(2)}x
                    </div>
                    <button
                      type="button"
                      onClick={() => adjustPlaybackSpeed(PLAYBACK_SPEED_STEP)}
                      disabled={playbackSpeed >= PLAYBACK_SPEED_MAX}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] px-2 text-[10px] font-bold text-stone-200 hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
                      title="Speed playback by 0.25x"
                    >
                      +0.25x
                    </button>

                    <input
                      type="range"
                      min={0}
                      max={frames.length - 1}
                      value={stepIndex}
                      onChange={(e) => {
                        setPlaying(false);
                        setStepIndex(Number(e.target.value));
                      }}
                      className="mx-2 h-1.5 flex-1 accent-amber-400"
                    />

                    <div className="w-24 shrink-0 text-right text-[11px] text-stone-400">
                      Step {stepIndex}/{frames.length - 1}
                    </div>
                  </div>

                  <div className="mt-2 truncate text-xs font-medium text-stone-200">
                    {currentFrame?.label ?? 'Start'}
                  </div>
                </>
              ) : (
                <div className="text-xs text-stone-500">
                  {selectedEntry?.status === 'solving'
                    ? 'Solving…'
                    : selectedEntry?.status === 'unsolved' ? (
                      <>
                        No solution found — {selectedEntry.solution?.reason ?? 'unknown reason'}.
                        {selectedEntry.solution?.trace ? (() => {
                          const traceLabel = selectedEntry.solution?.reason?.includes('Node limit')
                            ? 'Inspect Search Frontier'
                            : 'View Solver Trace';
                          return (
                            <button
                              type="button"
                              onClick={() => downloadTrace(selectedEntry.solution!.trace!, 'trace')}
                              className="ml-2 rounded-lg border border-amber-300/30 bg-amber-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-500/25"
                            >
                              Download Trace
                            </button>
                          );
                        })() : null}
                      </>
                    ) : selectedEntry?.status === 'error'
                      ? `Solver error: ${selectedEntry.error ?? 'unknown'}.`
                      : 'Solve this level to see a step-by-step visual playthrough.'}
                </div>
              )}
            </div>
          </div>
        )}
      </MapperPanelFrame>
    </div>
  );
};

export default LevelSolutionsBrowser;
