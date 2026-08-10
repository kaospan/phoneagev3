import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Position } from "@/game/types";
import type { SearchStats } from "@/lib/algorithms-lab";
import type { SolveState } from "@/lib/solver/state";
import { ALGORITHMS, getAlgorithm, type AlgorithmId, type SearchLimits } from "@/lib/algorithms-lab";
import { useSearchRunner } from "./useSearchRunner";
import { LevelCanvas } from "./LevelCanvas";
import { MetricComparisonBars, type ComparisonMetric } from "./MetricComparisonBars";
import { formatBytes, formatCount, formatRuntime } from "./formatters";

/** A short, data-driven sentence summarizing the head-to-head result — grounded entirely in
 *  the two runners' real measured stats, never a canned or fabricated claim. */
function buildInsight(statsA: SearchStats, nameA: string, statsB: SearchStats, nameB: string): string | null {
  const parts: string[] = [];

  if (statsA.expanded > 0 && statsB.expanded > 0) {
    const aFewer = statsA.expanded <= statsB.expanded;
    const fewer = aFewer ? statsA : statsB;
    const more = aFewer ? statsB : statsA;
    const fewerName = aFewer ? nameA : nameB;
    const moreName = aFewer ? nameB : nameA;
    const ratio = more.expanded / Math.max(1, fewer.expanded);
    parts.push(
      ratio >= 1.15
        ? `${fewerName} expanded ${ratio.toFixed(1)}× fewer states than ${moreName} on this level.`
        : `${nameA} and ${nameB} expanded a similar number of states here.`,
    );
  }

  if (statsA.solved && statsB.solved && statsA.moves !== null && statsB.moves !== null) {
    parts.push(
      statsA.moves === statsB.moves
        ? `Both found the same ${formatCount(statsA.moves)}-move solution.`
        : statsA.moves < statsB.moves
          ? `${nameA} found a shorter solution (${formatCount(statsA.moves)} vs ${formatCount(statsB.moves)} moves) — ${nameB} isn't guaranteed optimal.`
          : `${nameB} found a shorter solution (${formatCount(statsB.moves)} vs ${formatCount(statsA.moves)} moves) — ${nameA} isn't guaranteed optimal.`,
    );
  } else if (statsA.solved !== statsB.solved && (statsA.solved || statsB.solved)) {
    parts.push(`${statsA.solved ? nameA : nameB} solved the level within the search budget; ${statsA.solved ? nameB : nameA} did not.`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

export interface CompareModeProps {
  grid: number[][];
  cavePos: Position;
  playerStart: Position;
  start: SolveState;
  goalCaves: Position[];
  limits: SearchLimits;
  levelId?: number;
  onSolve?: (levelId: number) => void;
}

const AlgorithmSelect: React.FC<{ value: AlgorithmId; onChange: (id: AlgorithmId) => void; label: string }> = ({
  value,
  onChange,
  label,
}) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-muted-foreground">{label}</span>
    <Select value={value} onValueChange={(v) => onChange(v as AlgorithmId)}>
      <SelectTrigger className="h-8 w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ALGORITHMS.map((algo) => (
          <SelectItem key={algo.id} value={algo.id}>
            {algo.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

/** Runs two algorithms against the same level under identical limits and reports real measured
 *  numbers side by side — no visualization/stepping here, just the head-to-head result the
 *  Algorithms Lab spec calls out (BFS vs A* by default, but any pair can be chosen). */
export const CompareMode: React.FC<CompareModeProps> = ({ grid, cavePos, playerStart, start, goalCaves, limits, levelId, onSolve }) => {
  const [algoAId, setAlgoAId] = useState<AlgorithmId>("bfs");
  const [algoBId, setAlgoBId] = useState<AlgorithmId>("astar");

  const runnerA = useSearchRunner(getAlgorithm(algoAId), start, goalCaves, limits);
  const runnerB = useSearchRunner(getAlgorithm(algoBId), start, goalCaves, limits);

  React.useEffect(() => {
    if (runnerA.isDone && runnerA.stats.solved && levelId !== undefined && onSolve) {
      onSolve(levelId);
    }
  }, [runnerA.isDone, runnerA.stats.solved, levelId, onSolve]);
  React.useEffect(() => {
    if (runnerB.isDone && runnerB.stats.solved && levelId !== undefined && onSolve) {
      onSolve(levelId);
    }
  }, [runnerB.isDone, runnerB.stats.solved, levelId, onSolve]);

  const bothDone = runnerA.isDone && runnerB.isDone;
  const running = runnerA.isRunning || runnerB.isRunning;

  const runComparison = () => {
    runnerA.reset();
    runnerB.reset();
    runnerA.runToEnd();
    runnerB.runToEnd();
  };

  const rows: Array<{ label: string; format: (s: typeof runnerA.stats) => string }> = [
    { label: "Solved", format: (s) => (s.solved === null ? "running…" : s.solved ? "yes" : "no") },
    { label: "Solution length", format: (s) => (s.moves !== null ? `${formatCount(s.moves)} moves` : "—") },
    { label: "States expanded", format: (s) => formatCount(s.expanded) },
    { label: "Runtime", format: (s) => formatRuntime(s.elapsedMs) },
    { label: "Max frontier", format: (s) => formatCount(s.maxFrontierSize) },
    { label: "Approx. memory", format: (s) => formatBytes(s.approxMemoryBytes) },
  ];

  const nameA = getAlgorithm(algoAId).name;
  const nameB = getAlgorithm(algoBId).name;

  const comparisonMetrics: ComparisonMetric[] = [
    {
      label: "Solution length",
      valueA: runnerA.stats.moves ?? 0,
      valueB: runnerB.stats.moves ?? 0,
      formatValue: (n) => `${formatCount(n)} mv`,
    },
    { label: "States expanded", valueA: runnerA.stats.expanded, valueB: runnerB.stats.expanded, formatValue: formatCount },
    { label: "Runtime", valueA: runnerA.stats.elapsedMs, valueB: runnerB.stats.elapsedMs, formatValue: formatRuntime },
    {
      label: "Max frontier",
      valueA: runnerA.stats.maxFrontierSize,
      valueB: runnerB.stats.maxFrontierSize,
      formatValue: formatCount,
    },
  ];

  const insight = useMemo(
    () => (bothDone ? buildInsight(runnerA.stats, nameA, runnerB.stats, nameB) : null),
    [bothDone, runnerA.stats, runnerB.stats, nameA, nameB],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <AlgorithmSelect value={algoAId} onChange={setAlgoAId} label="A" />
        <AlgorithmSelect value={algoBId} onChange={setAlgoBId} label="B" />
        <Button size="sm" onClick={runComparison} disabled={running}>
          {running ? "Running…" : "Run comparison"}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            <TableHead className="text-right">{getAlgorithm(algoAId).name}</TableHead>
            <TableHead className="text-right">{getAlgorithm(algoBId).name}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {levelId !== undefined && (
            <TableRow>
              <TableCell colSpan={3} className="text-[11px] font-mono text-muted-foreground">
                Level number: {levelId}
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={row.label}>
              <TableCell className="text-muted-foreground">{row.label}</TableCell>
              <TableCell className="text-right font-mono">{row.format(runnerA.stats)}</TableCell>
              <TableCell className="text-right font-mono">{row.format(runnerB.stats)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {bothDone && (
        <>
          {insight && (
            <p className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm leading-relaxed text-foreground/90">
              {insight}
            </p>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">At a glance</p>
            <MetricComparisonBars metrics={comparisonMetrics} nameA={nameA} nameB={nameB} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{nameA} — explored states</p>
              <LevelCanvas
                grid={grid}
                cavePos={cavePos}
                playerStart={playerStart}
                overlay={runnerA.overlay}
                solutionPath={runnerA.solvedPath}
                width={320}
                height={200}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{nameB} — explored states</p>
              <LevelCanvas
                grid={grid}
                cavePos={cavePos}
                playerStart={playerStart}
                overlay={runnerB.overlay}
                solutionPath={runnerB.solvedPath}
                width={320}
                height={200}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CompareMode;
