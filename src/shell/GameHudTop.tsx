import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { TimerReset, Play } from "lucide-react";

export interface GameHudTopProps {
  currentLevelId: number;
  moves: number;
  timeLeftText: string | null;
  isTimerUrgent: boolean;
  redKeyCount: number;
  greenKeyCount: number;
  isWaitingToStart: boolean;
  onPrevLevel: () => void;
  onNextLevel: () => void;
  onStartLevel: () => void;
}

export const GameHudTop = forwardRef<HTMLDivElement, GameHudTopProps>(({
  currentLevelId,
  moves,
  timeLeftText,
  isTimerUrgent,
  redKeyCount,
  greenKeyCount,
  isWaitingToStart,
  onPrevLevel,
  onNextLevel,
  onStartLevel,
}, ref) => (
  <div ref={ref} className="absolute inset-x-0 top-0 z-50 flex items-start justify-between px-3 pt-3">
    <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-[#12130f]/88 px-2 py-1.5 shadow-xl backdrop-blur-md">
      <Button onClick={onPrevLevel} variant="ghost" size="sm" className="h-8 w-8 p-0 text-white font-bold">
        ←
      </Button>
      <div className="flex items-center gap-2 px-2 text-sm font-black text-amber-100">
        <span>L{currentLevelId}</span>
        <span className="text-stone-400 font-medium">M:{moves}</span>
        {timeLeftText && (
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-black tabular-nums ${
            isTimerUrgent ? 'border-red-300 bg-red-700 text-white animate-pulse' : 'border-white/20 bg-black/40 text-stone-200'
          }`}>
            <TimerReset className="h-3 w-3 text-amber-200" />
            {timeLeftText}
          </span>
        )}
        {isWaitingToStart && (
          <Button onClick={onStartLevel} size="sm" className="h-7 bg-emerald-500 text-emerald-950 font-black text-[10px]">
            <Play className="mr-1 h-3 w-3" /> START
          </Button>
        )}
        <div className="flex items-center gap-1 ml-1">
          {redKeyCount > 0 && <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded font-bold">🗝 {redKeyCount}</span>}
          {greenKeyCount > 0 && <span className="text-xs bg-green-600 text-white px-1.5 py-0.5 rounded font-bold">🔑 {greenKeyCount}</span>}
        </div>
      </div>
      <Button onClick={onNextLevel} variant="ghost" size="sm" className="h-8 w-8 p-0 text-white font-bold">
        →
      </Button>
    </div>
  </div>
));
GameHudTop.displayName = "GameHudTop";
