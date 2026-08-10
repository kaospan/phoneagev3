import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ALGORITHMS,
  DEFAULT_SEARCH_LIMITS,
  buildSearchInputs,
  getLabLevel,
  type AlgorithmId,
} from "@/lib/algorithms-lab";
import { loadSolvedLevels, persistSolvedLevels, type LevelRange, type LevelPickerFilters, type SolvedFilter } from "@/lib/algorithms-lab";
import { AlgorithmPicker } from "./AlgorithmPicker";
import { LevelPicker } from "./LevelPicker";
import { SingleAlgorithmRun } from "./SingleAlgorithmRun";
import { CompareMode } from "./CompareMode";

type LabMode = "single" | "compare";

/** Level 8 is the flagship "why did BFS explode?" level called out in the Algorithms Lab spec —
 *  defaulting to it means opening /algorithms immediately has something interesting to run. */
const DEFAULT_LEVEL_ID = 8;

/**
 * Top-level page for the Algorithms Lab — a dedicated, educational search-algorithm playground
 * that is intentionally isolated from the Mapper (src/components/level-mapper/**) and the
 * production solver (src/lib/solver/**): it only ever imports read-only state-transition/level
 * utilities from those, never their UI or editing state. See src/lib/algorithms-lab/** for the
 * steppable BFS/DFS/Greedy/A* engine and src/components/algorithms-lab/** for these panels.
 */
export const AlgorithmsLabPage: React.FC = () => {
  const [selectedLevelId, setSelectedLevelId] = useState(DEFAULT_LEVEL_ID);
  const [algorithmId, setAlgorithmId] = useState<AlgorithmId>("bfs");
  const [mode, setMode] = useState<LabMode>("single");
  const [solvedLevels, setSolvedLevels] = useState<Set<number>>(() => loadSolvedLevels());
  const [filters, setFilters] = useState<LevelPickerFilters>({
    range: "all",
    sortBy: "default",
    solvedFilter: "all",
  });

  const handleLevelSolved = useCallback((levelId: number) => {
    setSolvedLevels((prev) => {
      if (prev.has(levelId)) return prev;
      const next = new Set(prev);
      next.add(levelId);
      persistSolvedLevels(next);
      return next;
    });
  }, []);

  useEffect(() => {
    persistSolvedLevels(solvedLevels);
  }, [solvedLevels]);

  const level = useMemo(() => getLabLevel(selectedLevelId), [selectedLevelId]);
  const searchInputs = useMemo(() => (level ? buildSearchInputs(level) : null), [level]);

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-6 p-4 pb-12 sm:p-6 sm:pb-12">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Algorithms Lab</h1>
            <p className="text-sm text-muted-foreground">
              Watch BFS, DFS, Greedy Best-First, and A* search real Phoneage levels — one expansion at a time.
            </p>
          </div>
          <Link
            to="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Back to Phoneage
          </Link>
        </header>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Choose a level
          </h2>
          <LevelPicker
            selectedLevelId={selectedLevelId}
            onSelect={setSelectedLevelId}
            solvedLevels={solvedLevels}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </section>

        <Tabs value={mode} onValueChange={(v) => setMode(v as LabMode)}>
          <TabsList>
            <TabsTrigger value="single">Explore one algorithm</TabsTrigger>
            <TabsTrigger value="compare">Compare two algorithms</TabsTrigger>
          </TabsList>
        </Tabs>

        {!level || !searchInputs ? (
          <p className="text-sm text-muted-foreground">Select a level to begin.</p>
        ) : mode === "single" ? (
          <div className="space-y-4">
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Choose an algorithm
              </h2>
              <AlgorithmPicker algorithms={ALGORITHMS} selectedId={algorithmId} onSelect={setAlgorithmId} />
            </section>
            <SingleAlgorithmRun
              algorithmId={algorithmId}
              grid={level.grid}
              cavePos={level.cavePos}
              playerStart={level.playerStart}
              start={searchInputs.start}
              goalCaves={searchInputs.goalCaves}
              limits={DEFAULT_SEARCH_LIMITS}
              levelId={selectedLevelId}
              onSolve={handleLevelSolved}
            />
          </div>
        ) : (
          <CompareMode
            grid={level.grid}
            cavePos={level.cavePos}
            playerStart={level.playerStart}
            start={searchInputs.start}
            goalCaves={searchInputs.goalCaves}
            limits={DEFAULT_SEARCH_LIMITS}
            levelId={selectedLevelId}
            onSolve={handleLevelSolved}
          />
        )}
      </div>
    </div>
  );
};

export default AlgorithmsLabPage;
