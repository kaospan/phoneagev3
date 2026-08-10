import React, { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DIFFICULTY_TIERS,
  DIFFICULTY_TIER_LABELS,
  getLabLevels,
  type DifficultyTier,
  type LevelRange,
  type LevelPickerFilters,
  type SolvedFilter,
  applyLevelFilters,
  loadSolvedLevels,
  type LabLevelSummary,
} from "@/lib/algorithms-lab";
import { LevelCanvas } from "./LevelCanvas";

export interface LevelPickerProps {
  selectedLevelId: number | null;
  onSelect: (id: number) => void;
  solvedLevels: Set<number>;
  filters: LevelPickerFilters;
  onFiltersChange: (filters: LevelPickerFilters) => void;
}

const RANGE_OPTIONS: { value: LevelRange; label: string }[] = [
  { value: "all", label: "All levels" },
  { value: "1-100", label: "1 – 100" },
  { value: "101-200", label: "101 – 200" },
];

const SOLVED_OPTIONS: { value: SolvedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "solved", label: "Solved" },
  { value: "unsolved", label: "Unsolved" },
];

export const LevelPicker: React.FC<LevelPickerProps> = ({
  selectedLevelId,
  onSelect,
  solvedLevels,
  filters,
  onFiltersChange,
}) => {
  const levels = useMemo(() => getLabLevels(), []);
  const selectedTierDefault = useMemo(
    () => levels.find((l) => l.id === selectedLevelId)?.tier ?? "beginner",
    // Only used to compute the initial tab; intentionally not re-run when selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [activeTier, setActiveTier] = useState<DifficultyTier>(selectedTierDefault);

  const levelsInTier = useMemo(() => levels.filter((l) => l.tier === activeTier), [levels, activeTier]);
  const filteredLevels = useMemo(
    () => applyLevelFilters(levelsInTier, filters, solvedLevels),
    [levelsInTier, filters, solvedLevels],
  );

  const updateFilter = <K extends keyof LevelPickerFilters>(key: K, value: LevelPickerFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="space-y-3">
      <Tabs value={activeTier} onValueChange={(v) => setActiveTier(v as DifficultyTier)}>
        <TabsList>
          {DIFFICULTY_TIERS.map((tier) => (
            <TabsTrigger key={tier} value={tier}>
              {DIFFICULTY_TIER_LABELS[tier]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Range</span>
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={filters.range === opt.value ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => updateFilter("range", opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sort</span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={filters.sortBy === "default" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => updateFilter("sortBy", "default")}
            >
              Default
            </Button>
            <Button
              size="sm"
              variant={filters.sortBy === "number" ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => updateFilter("sortBy", "number")}
            >
              By number
            </Button>
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ml-2">Status</span>
          <div className="flex gap-1">
            {SOLVED_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={filters.solvedFilter === opt.value ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => updateFilter("solvedFilter", opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Default order ranks levels by a structural score (grid size, arrows, keys/locks, teleports, breakable rocks, and start-to-goal distance) — easier levels first. Use &quot;By number&quot; to see them in their original IDs.
      </p>

      <ScrollArea className="h-64 rounded-md border p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredLevels.map((level) => {
            const active = level.id === selectedLevelId;
            return (
              <button
                key={level.id}
                type="button"
                onClick={() => onSelect(level.id)}
                aria-pressed={active}
                title={level.highlightNote ?? `Level ${level.id}`}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors",
                  active ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground/50",
                )}
              >
                <LevelCanvas
                  grid={level.grid}
                  cavePos={level.cavePos}
                  playerStart={level.playerStart}
                  width={104}
                  height={66}
                />
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs">#{level.id}</span>
                  {level.highlighted && (
                    <Badge variant="outline" className="px-1 py-0 text-[9px] leading-4">
                      {level.highlighted === "bfs-explosion" ? "BFS explodes" : "known hard"}
                    </Badge>
                  )}
                  {solvedLevels.has(level.id) && (
                    <Badge variant="secondary" className="px-1 py-0 text-[9px] leading-4">
                      solved
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
          {filteredLevels.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">No levels match the current filters.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default LevelPicker;
