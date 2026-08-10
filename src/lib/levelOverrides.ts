import { getAllLevels, shouldAllowLevelOverride, type ColorTheme } from '@/data/levels';

export const LEVEL_OVERRIDES_UPDATED_EVENT = 'stone-age-level-overrides-updated';

export const notifyLevelOverridesUpdated = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LEVEL_OVERRIDES_UPDATED_EVENT));
};

export const saveLevelOverride = (
  levelId: number,
  grid: number[][],
  playerStart: { x: number; y: number },
  theme?: ColorTheme,
  timeLimitSeconds?: number | null
) => {
  if (typeof window === 'undefined') return;
  const level = getAllLevels().find((entry) => entry.id === levelId);
  if (level && !shouldAllowLevelOverride(level)) {
    console.log(`Skipping local override for level ${levelId}; code default is authoritative.`);
    return;
  }
  const key = `level_override_${levelId}`;
  let prev: unknown = null;
  try {
    prev = JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    prev = null;
  }
  const prevObj =
    prev && typeof prev === 'object' && !Array.isArray(prev) ? (prev as Record<string, unknown>) : null;

  // Preserve unknown fields in existing overrides so incremental writes (e.g. auto-build)
  // don't accidentally erase mapper-authored settings like per-level timers.
  const payload: Record<string, unknown> = {
    ...(prevObj ?? {}),
    grid,
    playerStart,
    ...(theme !== undefined ? { theme } : {}),
    ...(timeLimitSeconds !== undefined ? { timeLimitSeconds } : {}),
  };

  localStorage.setItem(key, JSON.stringify(payload));
  notifyLevelOverridesUpdated();
};
