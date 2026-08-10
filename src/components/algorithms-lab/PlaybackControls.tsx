import React from "react";
import { FastForward, Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export interface PlaybackControlsProps {
  isRunning: boolean;
  isDone: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onRunToEnd: () => void;
  onSpeedChange: (speed: number) => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isRunning,
  isDone,
  speed,
  onPlay,
  onPause,
  onStep,
  onReset,
  onRunToEnd,
  onSpeedChange,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        {isRunning ? (
          <Button size="sm" variant="secondary" onClick={onPause}>
            <Pause /> Pause
          </Button>
        ) : (
          <Button size="sm" onClick={onPlay} disabled={isDone}>
            <Play /> Play
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onStep} disabled={isRunning || isDone}>
          <StepForward /> Step
        </Button>
        <Button size="sm" variant="outline" onClick={onRunToEnd} disabled={isDone}>
          <FastForward /> Run to end
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset}>
          <RotateCcw /> Reset
        </Button>
      </div>
      <div className="flex min-w-[160px] flex-1 items-center gap-2">
        <span className="whitespace-nowrap text-xs text-muted-foreground">Speed</span>
        <Slider
          value={[speed]}
          min={1}
          max={10}
          step={1}
          onValueChange={([v]) => onSpeedChange(v)}
          className="max-w-[160px]"
        />
      </div>
    </div>
  );
};

export default PlaybackControls;
