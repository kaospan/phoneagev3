import React from "react";
import type { Position } from "@/game/types";
import type { SolveState } from "@/lib/solver/state";
import { getAlgorithm, type AlgorithmId, type SearchLimits } from "@/lib/algorithms-lab";
import { useSearchRunner } from "./useSearchRunner";
import { LevelCanvas } from "./LevelCanvas";
import { StatsPanel } from "./StatsPanel";
import { FrontierPanel } from "./FrontierPanel";
import { ExplanationPanel } from "./ExplanationPanel";
import { PlaybackControls } from "./PlaybackControls";

export interface SingleAlgorithmRunProps {
  algorithmId: AlgorithmId;
  grid: number[][];
  cavePos: Position;
  playerStart: Position;
  start: SolveState;
  goalCaves: Position[];
  limits: SearchLimits;
  levelId?: number;
  onSolve?: (levelId: number) => void;
}

/** Wires one AlgorithmDescriptor + useSearchRunner instance to the visualization + all the
 *  supporting panels. Isolated in its own component (rather than living inline in the page) so
 *  it can be swapped out cleanly for CompareMode without any conditional-hook-call issues. */
export const SingleAlgorithmRun: React.FC<SingleAlgorithmRunProps> = ({
  algorithmId,
  grid,
  cavePos,
  playerStart,
  start,
  goalCaves,
  limits,
  levelId,
  onSolve,
}) => {
  const algorithm = getAlgorithm(algorithmId);
  const runner = useSearchRunner(algorithm, start, goalCaves, limits);

  React.useEffect(() => {
    if (runner.isDone && runner.stats.solved && levelId !== undefined && onSolve) {
      onSolve(levelId);
    }
  }, [runner.isDone, runner.stats.solved, levelId, onSolve]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-3">
        <div className="flex min-w-0 justify-center rounded-lg border bg-card p-3">
          <LevelCanvas
            grid={grid}
            cavePos={cavePos}
            playerStart={playerStart}
            overlay={runner.overlay}
            currentPos={runner.isDone ? null : runner.currentPos}
            solutionPath={runner.solvedPath}
            width={480}
            height={300}
          />
        </div>
        <PlaybackControls
          isRunning={runner.isRunning}
          isDone={runner.isDone}
          speed={runner.speed}
          onPlay={runner.play}
          onPause={runner.pause}
          onStep={runner.step}
          onReset={runner.reset}
          onRunToEnd={runner.runToEnd}
          onSpeedChange={runner.setSpeed}
        />
        <StatsPanel algorithmName={algorithm.name} stats={runner.stats} levelId={levelId} />
      </div>
      <div className="space-y-4">
        <ExplanationPanel algorithm={algorithm} currentNode={runner.currentNode} />
        <FrontierPanel events={runner.recentEvents} usesHeuristic={algorithm.usesHeuristic} />
      </div>
    </div>
  );
};

export default SingleAlgorithmRun;
