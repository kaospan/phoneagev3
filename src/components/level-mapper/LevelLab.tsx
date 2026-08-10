import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, FlaskConical, Loader2, Play, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { GameTop2D } from "@/components/GameTop2D";
import { useLevelMapper } from "@/components/level-mapper/useLevelMapper";
import { MapperMetricPill, MapperPanelFrame, MapperSection } from "./MapperChrome";
import {
  generateLevelLabCampaign,
  generateLevelLabCandidate,
  type LevelLabCandidate,
  type LevelLabDifficulty,
  type LevelLabMechanics,
} from "@/lib/levelLab";
import { getAllLevels, type ColorTheme } from "@/data/levels";
import { saveLevelOverride } from "@/lib/levelOverrides";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STORAGE_KEY = "phoneage:level-lab:candidates:v1";
const KEPT_STORAGE_KEY = "phoneage:level-lab:kept:v1";
const KEEP_LIMIT = 5;

const difficulties: LevelLabDifficulty[] = ["easy", "medium", "hard", "expert"];
const promotedThemeCycle: ColorTheme[] = ["default", "ocean", "forest", "sunset", "lava", "crystal", "snow", "gray"];

const loadCandidates = (): LevelLabCandidate[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveCandidates = (items: LevelLabCandidate[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 300)));
  } catch {
    toast.warning("Level Lab history could not be saved in this browser.");
  }
};

const loadKeptIds = (): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEPT_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
};

const saveKeptIds = (ids: Set<string>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEPT_STORAGE_KEY, JSON.stringify([...ids].slice(0, KEEP_LIMIT)));
  } catch {
    toast.warning("Level Lab keep list could not be saved in this browser.");
  }
};

const mechanicLabel = (mechanics: LevelLabMechanics) =>
  [
    mechanics.keys ? "Keys" : null,
    mechanics.arrows ? "Arrows" : null,
    mechanics.teleports ? "Teleports" : null,
  ].filter(Boolean).join(" + ") || "Path only";

export const LevelLab: React.FC = () => {
  const {
    setRows,
    setCols,
    setGrid,
    setPlayerStart,
    setTheme,
    setTimeLimitSeconds,
    setHourglassBonusByCell,
    setImageURL,
    setOverlayEnabled,
    setImportLevelIndex,
    setAllLevels,
    setIsSaved,
    setLoadedSnapshot,
  } = useLevelMapper();

  const [difficulty, setDifficulty] = useState<LevelLabDifficulty>("medium");
  const [mechanics, setMechanics] = useState<LevelLabMechanics>({
    keys: true,
    arrows: true,
    teleports: false,
  });
  const [candidates, setCandidates] = useState<LevelLabCandidate[]>(loadCandidates);
  const [selectedId, setSelectedId] = useState<string | null>(() => loadCandidates()[0]?.id ?? null);
  const [keptIds, setKeptIds] = useState<Set<string>>(loadKeptIds);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [campaignSummary, setCampaignSummary] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    saveCandidates(candidates);
  }, [candidates]);

  useEffect(() => {
    saveKeptIds(keptIds);
  }, [keptIds]);

  const selected = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0] ?? null,
    [candidates, selectedId],
  );

  const solvedCandidates = candidates.filter((candidate) => candidate.solved);
  const keptCandidates = candidates.filter((candidate) => keptIds.has(candidate.id));
  const bestCandidates = solvedCandidates.slice().sort((a, b) => b.score - a.score).slice(0, KEEP_LIMIT);

  const addCandidate = (candidate: LevelLabCandidate) => {
    setCandidates((prev) => [candidate, ...prev].sort((a, b) => b.score - a.score).slice(0, 300));
    setSelectedId(candidate.id);
  };

  const generateMany = async (count: number) => {
    if (isGenerating) return;
    cancelRef.current = false;
    setIsGenerating(true);
    setProgress({ done: 0, total: count });
    const baseSeed = Date.now() % 1_000_000_000;
    const generated: LevelLabCandidate[] = [];

    try {
      for (let i = 0; i < count; i += 1) {
        if (cancelRef.current) break;
        const candidate = await generateLevelLabCandidate({
          seed: baseSeed + i * 97,
          difficulty,
          mechanics,
        });
        generated.push(candidate);
        setProgress({ done: i + 1, total: count });
        if ((i + 1) % 5 === 0) {
          setCandidates((prev) => [...generated, ...prev].sort((a, b) => b.score - a.score).slice(0, 300));
        }
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      if (generated.length > 0) {
        const merged = [...generated, ...candidates].sort((a, b) => b.score - a.score).slice(0, 300);
        setCandidates(merged);
        setSelectedId(merged[0]?.id ?? null);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const generateCampaignAndWrite = async () => {
    if (isGenerating) return;
    const confirmed = window.confirm(
      "Generate 1000 candidates and overwrite local level overrides 101-200 with the best solved levels by difficulty bands?\n\nEasy: 101-125\nMedium: 126-150\nHard: 151-175\nExpert: 176-200",
    );
    if (!confirmed) return;

    cancelRef.current = false;
    setIsGenerating(true);
    setProgress({ done: 0, total: 1000 });
    setCampaignSummary(null);

    try {
      const result = await generateLevelLabCampaign({
        seed: Date.now() % 1_000_000_000,
        candidateCount: 1000,
        levelsToPromote: 100,
        shouldCancel: () => cancelRef.current,
        onProgress: (done, total) => setProgress({ done, total }),
      });

      for (const candidate of result.promoted) {
        if (!candidate.promotedLevelId) continue;
        saveLevelOverride(
          candidate.promotedLevelId,
          candidate.grid,
          candidate.playerStart,
          promotedThemeCycle[(candidate.promotedLevelId - 101) % promotedThemeCycle.length],
          null,
        );
      }

      const merged = [...result.promoted, ...result.generated, ...candidates]
        .sort((a, b) => (b.promotedLevelId ? 1 : 0) - (a.promotedLevelId ? 1 : 0) || b.score - a.score)
        .slice(0, 300);
      setCandidates(merged);
      setSelectedId(result.promoted[0]?.id ?? merged[0]?.id ?? null);
      setAllLevels(getAllLevels());
      const message = `Generated ${result.attempted} candidates and wrote ${result.promoted.length} solved levels to 101-200 (Easy 101-125, Medium 126-150, Hard 151-175, Expert 176-200).`;
      setCampaignSummary(message);
      if (result.promoted.length === 100) {
        toast.success(message);
      } else {
        toast.warning(message);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleKept = (candidate: LevelLabCandidate) => {
    setKeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidate.id)) {
        next.delete(candidate.id);
        return next;
      }
      if (next.size >= KEEP_LIMIT) {
        toast.warning(`Keep list is capped at ${KEEP_LIMIT}. Discard one before keeping another.`);
        return next;
      }
      next.add(candidate.id);
      return next;
    });
  };

  const loadInEditor = (candidate: LevelLabCandidate) => {
    const grid = candidate.grid.map((row) => [...row]);
    setImportLevelIndex(null);
    setRows(grid.length);
    setCols(grid[0]?.length ?? 0);
    setGrid(grid);
    setPlayerStart({ ...candidate.playerStart });
    setTheme("default");
    setTimeLimitSeconds(null);
    setHourglassBonusByCell({});
    setImageURL(null);
    setOverlayEnabled(false);
    setLoadedSnapshot({
      levelId: null,
      grid,
      playerStart: { ...candidate.playerStart },
      provenance: "user-edited",
      theme: "default",
      timeLimitSeconds: null,
      hourglassBonusByCell: {},
      imageURL: null,
      overlayEnabled: false,
      overlayOpacity: 0.5,
      overlayStretch: true,
      imageScaleX: 1,
      imageScaleY: 1,
      imageOffsetX: 0,
      imageOffsetY: 0,
      lockImageAspect: true,
      zoom: 1,
      gridOffsetX: 0,
      gridOffsetY: 0,
      gridFrameWidth: null,
      gridFrameHeight: null,
    });
    setIsSaved(false);
    toast.success("Candidate loaded in the editor.");
  };

  const discardCandidate = (candidateId: string) => {
    setCandidates((prev) => prev.filter((candidate) => candidate.id !== candidateId));
    setKeptIds((prev) => {
      const next = new Set(prev);
      next.delete(candidateId);
      return next;
    });
    if (selectedId === candidateId) setSelectedId(null);
  };

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-hidden">
      <MapperPanelFrame className="w-[360px] shrink-0">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-50">
              <FlaskConical className="h-4 w-4 text-amber-200" />
              Level Lab
            </div>
            <div className="mt-1 text-xs leading-snug text-stone-400">
              Generate solver-checked candidates, keep the best five, and load one into the mapper to polish.
            </div>
          </div>

          <div className="space-y-3 p-3">
            <MapperSection title="Difficulty" contentClassName="space-y-2">
              <RadioGroup value={difficulty} onValueChange={(value) => setDifficulty(value as LevelLabDifficulty)}>
                {difficulties.map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <RadioGroupItem id={`lab-${item}`} value={item} />
                    <Label htmlFor={`lab-${item}`} className="capitalize text-stone-200">{item}</Label>
                  </div>
                ))}
              </RadioGroup>
            </MapperSection>

            <MapperSection title="Mechanics" contentClassName="space-y-2">
              {([
                ["keys", "Keys"],
                ["arrows", "Arrows"],
                ["teleports", "Teleports"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-stone-200">
                  <Checkbox
                    checked={mechanics[key]}
                    onCheckedChange={(checked) => setMechanics((prev) => ({ ...prev, [key]: checked === true }))}
                  />
                  {label}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm text-stone-500" title="No playable ice tile exists yet.">
                <Checkbox checked={false} disabled />
                Ice
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-500" title="No playable monster tile exists yet.">
                <Checkbox checked={false} disabled />
                Monsters
              </label>
            </MapperSection>

            <div className="grid grid-cols-2 gap-2">
              <Button disabled={isGenerating} onClick={() => void generateMany(1)} className="gap-2">
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Generate
              </Button>
              <Button disabled={isGenerating} variant="secondary" onClick={() => void generateMany(100)} className="gap-2">
                Generate 100
              </Button>
            </div>

            <Button disabled={isGenerating} variant="outline" onClick={() => void generateCampaignAndWrite()} className="w-full gap-2">
              {isGenerating && progress.total === 1000 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Generate 1000 → write 101-200
            </Button>

            {isGenerating && (
              <Button variant="outline" className="w-full" onClick={() => { cancelRef.current = true; }}>
                Stop after current candidate ({progress.done}/{progress.total})
              </Button>
            )}

            {campaignSummary && (
              <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs leading-snug text-emerald-100">
                {campaignSummary}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <MapperMetricPill label="Total" value={candidates.length} />
              <MapperMetricPill label="Solved" value={solvedCandidates.length} tone="success" />
              <MapperMetricPill label="Kept" value={`${keptCandidates.length}/${KEEP_LIMIT}`} tone="info" />
            </div>

            <MapperSection title="Best 5" contentClassName="space-y-2">
              {bestCandidates.length === 0 ? (
                <div className="text-xs text-stone-500">No solved candidates yet.</div>
              ) : (
                bestCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedId(candidate.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-xs hover:border-amber-200/30"
                  >
                    <span className="font-semibold text-stone-100">{candidate.moves} moves</span>
                    <span className="text-stone-400">Score {candidate.score}</span>
                  </button>
                ))
              )}
            </MapperSection>
          </div>
        </div>
      </MapperPanelFrame>

      <MapperPanelFrame className="min-w-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-stone-50">
                {selected ? `${selected.difficulty.toUpperCase()} candidate ${selected.seed}` : "No candidate selected"}
              </div>
              <div className="mt-0.5 text-xs text-stone-400">
                {selected ? `${mechanicLabel(selected.mechanics)} · ${selected.solved ? `${selected.moves} moves` : selected.reason}` : "Generate a candidate to start reviewing."}
              </div>
            </div>
            {selected && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => toggleKept(selected)} className="gap-2">
                  <Check className="h-4 w-4" />
                  {keptIds.has(selected.id) ? "Kept" : "Keep"}
                </Button>
                <Button size="sm" onClick={() => loadInEditor(selected)} className="gap-2">
                  <Save className="h-4 w-4" />
                  Load in editor
                </Button>
                <Button variant="destructive" size="sm" onClick={() => discardCandidate(selected.id)} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Discard
                </Button>
              </div>
            )}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,1fr)_320px] gap-3 p-3">
            <div className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
              {selected ? (
                <GameTop2D
                  grid={selected.grid}
                  cavePos={selected.cavePos}
                  playerStart={selected.playerStart}
                  players={[{ id: "lab", pos: selected.playerStart, facing: "right", color: "#facc15", isLocal: true }]}
                  zoomFactor={0.9}
                  fullBleed
                  theme="default"
                  levelId={selected.id}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-stone-500">No preview</div>
              )}
            </div>

            <div className="min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.035] p-3">
              <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-stone-400">Candidate Queue</div>
              <div className="space-y-2">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSelectedId(candidate.id)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                      candidate.id === selected?.id
                        ? "border-amber-300/40 bg-amber-500/10"
                        : "border-white/10 bg-white/[0.035] hover:border-white/20",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-stone-100">
                        {candidate.promotedLevelId ? `Level ${candidate.promotedLevelId}` : `Seed ${candidate.seed}`}
                      </span>
                      <span className={cn("text-[10px] font-black uppercase tracking-[0.14em]", candidate.solved ? "text-emerald-200" : "text-red-200")}>
                        {candidate.solved ? "Solved" : "Unsolved"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-stone-400">
                      {candidate.moves ?? "-"} moves · Score {candidate.score} · {candidate.nodesExpanded} nodes
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </MapperPanelFrame>
    </div>
  );
};

export default LevelLab;
