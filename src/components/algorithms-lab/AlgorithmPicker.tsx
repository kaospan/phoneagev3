import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AlgorithmDescriptor, AlgorithmId } from "@/lib/algorithms-lab";

export interface AlgorithmPickerProps {
  algorithms: AlgorithmDescriptor[];
  selectedId: AlgorithmId;
  onSelect: (id: AlgorithmId) => void;
  disabled?: boolean;
}

export const AlgorithmPicker: React.FC<AlgorithmPickerProps> = ({ algorithms, selectedId, onSelect, disabled }) => {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {algorithms.map((algo) => {
        const active = algo.id === selectedId;
        return (
          <button
            key={algo.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(algo.id)}
            aria-pressed={active}
            className={cn(
              "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : "border-border bg-card hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold">{algo.name}</span>
            </div>
            <p className="text-xs text-muted-foreground">{algo.shortDescription}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge variant={algo.optimalGuaranteed ? "default" : "secondary"} className="text-[10px]">
                {algo.optimalGuaranteed ? "Optimal" : "Not optimal"}
              </Badge>
              {algo.usesHeuristic && (
                <Badge variant="outline" className="text-[10px]">
                  Uses heuristic
                </Badge>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default AlgorithmPicker;
