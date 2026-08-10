const STORAGE_KEY = "stone-age-campaign-progress-v1";
const STORAGE_VERSION = 1;

export interface CampaignLevelRecord {
  completed: boolean;
  clearCount: number;
  bestMoves: number | null;
  lastMoves: number | null;
  bestTimeLeftSeconds: number | null;
  lastTimeLeftSeconds: number | null;
  lastCompletedAt: number | null;
}

export interface CampaignProgressState {
  version: number;
  highestUnlockedLevelId: number;
  lastPlayedLevelId: number | null;
  levels: Record<string, CampaignLevelRecord>;
}

interface RecordLevelCompletionArgs {
  progress: CampaignProgressState;
  levelId: number;
  moves: number;
  timeLeftSeconds: number | null;
  nextLevelId?: number | null;
}

export interface LevelCompletionProgressUpdate {
  progress: CampaignProgressState;
  record: CampaignLevelRecord;
  isFirstClear: boolean;
  isNewBestMoves: boolean;
  isNewBestTime: boolean;
}

const createDefaultProgress = (): CampaignProgressState => ({
  version: STORAGE_VERSION,
  highestUnlockedLevelId: 1,
  lastPlayedLevelId: 1,
  levels: {},
});

const toNonNegativeInt = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
};

const sanitizeLevelRecord = (value: unknown): CampaignLevelRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const completed = Boolean(raw.completed);
  const clearCount = toNonNegativeInt(raw.clearCount) ?? (completed ? 1 : 0);

  return {
    completed,
    clearCount,
    bestMoves: toNonNegativeInt(raw.bestMoves),
    lastMoves: toNonNegativeInt(raw.lastMoves),
    bestTimeLeftSeconds: toNonNegativeInt(raw.bestTimeLeftSeconds),
    lastTimeLeftSeconds: toNonNegativeInt(raw.lastTimeLeftSeconds),
    lastCompletedAt: toNonNegativeInt(raw.lastCompletedAt),
  };
};

const sanitizeProgress = (value: unknown): CampaignProgressState => {
  const fallback = createDefaultProgress();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;

  const raw = value as Record<string, unknown>;
  const highestUnlockedLevelId = toNonNegativeInt(raw.highestUnlockedLevelId) ?? fallback.highestUnlockedLevelId;
  const lastPlayedLevelId = toNonNegativeInt(raw.lastPlayedLevelId);
  const out: Record<string, CampaignLevelRecord> = {};

  if (raw.levels && typeof raw.levels === "object" && !Array.isArray(raw.levels)) {
    for (const [levelId, record] of Object.entries(raw.levels as Record<string, unknown>)) {
      const normalizedLevelId = toNonNegativeInt(levelId);
      const normalizedRecord = sanitizeLevelRecord(record);
      if (normalizedLevelId == null || normalizedLevelId <= 0 || !normalizedRecord) continue;
      out[String(normalizedLevelId)] = normalizedRecord;
    }
  }

  return {
    version: STORAGE_VERSION,
    highestUnlockedLevelId: Math.max(1, highestUnlockedLevelId),
    lastPlayedLevelId: lastPlayedLevelId && lastPlayedLevelId > 0 ? lastPlayedLevelId : fallback.lastPlayedLevelId,
    levels: out,
  };
};

export const loadCampaignProgress = (): CampaignProgressState => {
  if (typeof window === "undefined") return createDefaultProgress();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProgress();
    return sanitizeProgress(JSON.parse(raw));
  } catch {
    return createDefaultProgress();
  }
};

export const saveCampaignProgress = (progress: CampaignProgressState): void => {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage failures so gameplay never breaks.
  }
};

/** Wipes local level progress back to a fresh Level-1-only state ("start over"). */
export const resetCampaignProgress = (): CampaignProgressState => {
  const fresh = createDefaultProgress();
  saveCampaignProgress(fresh);
  return fresh;
};

export const syncCampaignProgress = (
  progress: CampaignProgressState,
  levelIds: number[],
): CampaignProgressState => {
  if (levelIds.length === 0) return progress;

  const firstLevelId = levelIds[0];
  const lastPlayableId = levelIds[levelIds.length - 1];
  const currentHighestIndex = getHighestUnlockedLevelIndex(progress, levelIds);
  const highestUnlockedLevelId =
    levelIds[Math.max(0, Math.min(levelIds.length - 1, currentHighestIndex))] ?? firstLevelId;

  const lastPlayedLevelId =
    progress.lastPlayedLevelId != null && levelIds.includes(progress.lastPlayedLevelId)
      ? progress.lastPlayedLevelId
      : Math.min(Math.max(firstLevelId, highestUnlockedLevelId), lastPlayableId);

  if (
    highestUnlockedLevelId === progress.highestUnlockedLevelId &&
    lastPlayedLevelId === progress.lastPlayedLevelId
  ) {
    return progress;
  }

  return {
    ...progress,
    highestUnlockedLevelId,
    lastPlayedLevelId,
  };
};

export const setLastPlayedLevel = (
  progress: CampaignProgressState,
  levelId: number,
): CampaignProgressState => {
  if (!Number.isInteger(levelId) || levelId <= 0 || progress.lastPlayedLevelId === levelId) {
    return progress;
  }

  return {
    ...progress,
    lastPlayedLevelId: levelId,
  };
};

export const getLevelCampaignRecord = (
  progress: CampaignProgressState,
  levelId: number,
): CampaignLevelRecord | null => {
  return progress.levels[String(levelId)] ?? null;
};

export const getCompletedLevelCount = (
  progress: CampaignProgressState,
  levelIds: number[],
): number => {
  let count = 0;
  for (const levelId of levelIds) {
    if (progress.levels[String(levelId)]?.completed) count += 1;
  }
  return count;
};

export const getHighestUnlockedLevelIndex = (
  progress: CampaignProgressState,
  levelIds: number[],
): number => {
  if (levelIds.length === 0) return -1;

  const exactIndex = levelIds.indexOf(progress.highestUnlockedLevelId);
  if (exactIndex >= 0) return exactIndex;

  for (let i = levelIds.length - 1; i >= 0; i -= 1) {
    if (levelIds[i] <= progress.highestUnlockedLevelId) return i;
  }

  return 0;
};

export const formatCampaignClock = (seconds: number | null | undefined): string | null => {
  if (seconds == null) return null;
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
};

export const recordLevelCompletion = ({
  progress,
  levelId,
  moves,
  timeLeftSeconds,
  nextLevelId,
}: RecordLevelCompletionArgs): LevelCompletionProgressUpdate => {
  const key = String(levelId);
  const previous = progress.levels[key];
  const normalizedMoves = Math.max(0, Math.round(moves));
  const normalizedTimeLeft = timeLeftSeconds == null ? null : Math.max(0, Math.round(timeLeftSeconds));
  const isFirstClear = !previous?.completed;
  const isNewBestMoves = previous?.bestMoves == null || normalizedMoves < previous.bestMoves;
  const isNewBestTime =
    normalizedTimeLeft != null &&
    (previous?.bestTimeLeftSeconds == null || normalizedTimeLeft > previous.bestTimeLeftSeconds);

  const nextRecord: CampaignLevelRecord = {
    completed: true,
    clearCount: (previous?.clearCount ?? 0) + 1,
    bestMoves: isNewBestMoves ? normalizedMoves : (previous?.bestMoves ?? normalizedMoves),
    lastMoves: normalizedMoves,
    bestTimeLeftSeconds:
      normalizedTimeLeft == null
        ? previous?.bestTimeLeftSeconds ?? null
        : isNewBestTime
          ? normalizedTimeLeft
          : (previous?.bestTimeLeftSeconds ?? normalizedTimeLeft),
    lastTimeLeftSeconds: normalizedTimeLeft,
    lastCompletedAt: Date.now(),
  };

  const highestUnlockedLevelId = Math.max(
    progress.highestUnlockedLevelId,
    levelId,
    Number.isInteger(nextLevelId) && (nextLevelId as number) > 0 ? (nextLevelId as number) : 0,
  );

  const nextProgress: CampaignProgressState = {
    ...progress,
    highestUnlockedLevelId,
    lastPlayedLevelId: levelId,
    levels: {
      ...progress.levels,
      [key]: nextRecord,
    },
  };

  return {
    progress: nextProgress,
    record: nextRecord,
    isFirstClear,
    isNewBestMoves,
    isNewBestTime,
  };
};
