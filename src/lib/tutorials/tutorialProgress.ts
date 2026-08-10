import type { TutorialId } from "./tutorialTypes";

export const TUTORIALS_ENABLED_UPDATED_EVENT = "tutorials-enabled-updated";
const ENABLED_KEY = "stone-age-tutorials-enabled";
const SEEN_KEY = "stone-age-tutorials-seen";

export const getTutorialsEnabled = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    return (localStorage.getItem(ENABLED_KEY) ?? "1") === "1";
  } catch {
    return true;
  }
};

export const setTutorialsEnabled = (enabled: boolean): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
    window.dispatchEvent(new Event(TUTORIALS_ENABLED_UPDATED_EVENT));
  } catch {
    // ignore storage failures
  }
};

const readSeenSet = (): Set<TutorialId> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed as TutorialId[]);
  } catch {
    return new Set();
  }
};

const writeSeenSet = (seen: Set<TutorialId>): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // ignore storage failures
  }
};

export const getSeenTutorials = (): Set<TutorialId> => readSeenSet();

export const hasSeenTutorial = (id: TutorialId): boolean => readSeenSet().has(id);

export const markTutorialSeen = (id: TutorialId): void => {
  const seen = readSeenSet();
  if (seen.has(id)) return;
  seen.add(id);
  writeSeenSet(seen);
};

/** Resets all "seen" state so every tutorial will auto-show again — used by "Replay Tutorials". */
export const resetSeenTutorials = (): void => {
  writeSeenSet(new Set());
};
