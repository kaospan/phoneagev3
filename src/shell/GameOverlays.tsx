import type { LevelCompletionSummary } from "@/hooks/useGameEngine";
import { Button } from "@/components/ui/button";
import { RotateCcw, Play } from "lucide-react";

export interface GameOverlaysProps {
  isTimeUp: boolean;
  isComplete: boolean;
  completionSummary: LevelCompletionSummary | null;
  moves: number;
  currentLevelId: number;
  onResetLevel: () => void;
  onNextLevel: () => void;
  onStartReplay?: () => void;
  hasRecordedRun?: boolean;
}

export const GameOverlays = ({
  isTimeUp,
  isComplete,
  completionSummary,
  moves,
  currentLevelId,
  onResetLevel,
  onNextLevel,
  onStartReplay,
  hasRecordedRun,
}: GameOverlaysProps) => {
  if (isTimeUp) {
    return (
      <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
        <div className="w-full max-w-xl rounded-[28px] border border-red-200/20 bg-stone-950/92 p-6 text-stone-50 shadow-2xl text-center">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Time Expired</div>
          <div className="mt-2 text-3xl font-black uppercase tracking-[0.14em] text-red-50">Time&apos;s Up!</div>
          <div className="mt-3 text-sm font-semibold text-stone-300">Level {currentLevelId} stopped at {moves} moves.</div>
          <div className="mt-6 flex justify-center">
            <Button onClick={onResetLevel} className="bg-red-300 text-stone-950 hover:bg-red-200">
              Restart Level
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isComplete && completionSummary) {
    return (
      <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
        <div className="w-full max-w-3xl rounded-[28px] border border-white/15 bg-stone-950/92 p-6 text-stone-50 shadow-2xl text-center">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Stage Cleared</div>
          <div className="mt-2 text-3xl font-black uppercase tracking-[0.14em]">Level {completionSummary.levelId} Complete</div>

          <div className="mx-auto mt-6 grid w-full max-w-md grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Run Moves</div>
              <div className="mt-2 text-3xl font-black">{completionSummary.moves}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Personal Best</div>
              <div className="mt-2 text-3xl font-black">{completionSummary.bestMoves ?? "--"}</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={onResetLevel} variant="outline" className="border-white/15 bg-white/5 text-stone-50 hover:bg-white/10">
              <RotateCcw className="mr-2 h-4 w-4" /> Restart Level
            </Button>
            {hasRecordedRun && onStartReplay && (
              <Button onClick={onStartReplay} variant="outline" className="border-red-300/30 bg-red-500/10 text-red-100 hover:bg-red-500/20">
                <Play className="mr-2 h-4 w-4" /> Watch Replay
              </Button>
            )}
            <Button onClick={onNextLevel} className="bg-amber-300 text-stone-950 hover:bg-amber-200">
              Next Level
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
