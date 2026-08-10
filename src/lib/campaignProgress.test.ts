import { beforeEach, describe, expect, it } from "vitest";
import {
  formatCampaignClock,
  getCompletedLevelCount,
  getHighestUnlockedLevelIndex,
  getLevelCampaignRecord,
  loadCampaignProgress,
  recordLevelCompletion,
  saveCampaignProgress,
  syncCampaignProgress,
  type CampaignProgressState,
} from "./campaignProgress";

const LEVEL_IDS = [1, 2, 3, 4, 5];

const freshProgress = (): CampaignProgressState => ({
  version: 1,
  highestUnlockedLevelId: 1,
  lastPlayedLevelId: 1,
  levels: {},
});

describe("formatCampaignClock", () => {
  it("formats seconds as m:ss", () => {
    expect(formatCampaignClock(0)).toBe("0:00");
    expect(formatCampaignClock(65)).toBe("1:05");
    expect(formatCampaignClock(600)).toBe("10:00");
  });

  it("returns null for null/undefined", () => {
    expect(formatCampaignClock(null)).toBeNull();
    expect(formatCampaignClock(undefined)).toBeNull();
  });

  it("clamps negative values to zero", () => {
    expect(formatCampaignClock(-5)).toBe("0:00");
  });
});

describe("recordLevelCompletion", () => {
  it("marks a level completed on first clear and unlocks the next level", () => {
    const { progress, isFirstClear, record } = recordLevelCompletion({
      progress: freshProgress(),
      levelId: 1,
      moves: 12,
      timeLeftSeconds: 30,
      nextLevelId: 2,
    });
    expect(isFirstClear).toBe(true);
    expect(record.completed).toBe(true);
    expect(record.clearCount).toBe(1);
    expect(record.bestMoves).toBe(12);
    expect(progress.highestUnlockedLevelId).toBe(2);
  });

  it("tracks best moves/time across repeated clears without regressing on a worse run", () => {
    let progress = freshProgress();
    ({ progress } = recordLevelCompletion({ progress, levelId: 1, moves: 20, timeLeftSeconds: 10, nextLevelId: 2 }));
    const second = recordLevelCompletion({ progress, levelId: 1, moves: 30, timeLeftSeconds: 5, nextLevelId: 2 });

    expect(second.isFirstClear).toBe(false);
    expect(second.isNewBestMoves).toBe(false);
    expect(second.record.bestMoves).toBe(20); // kept the better (lower) move count
    expect(second.record.lastMoves).toBe(30); // but tracks the latest run too
    expect(second.record.clearCount).toBe(2);
  });

  it("records a new best when the run genuinely improves", () => {
    let progress = freshProgress();
    ({ progress } = recordLevelCompletion({ progress, levelId: 1, moves: 20, timeLeftSeconds: 10, nextLevelId: 2 }));
    const second = recordLevelCompletion({ progress, levelId: 1, moves: 8, timeLeftSeconds: 25, nextLevelId: 2 });

    expect(second.isNewBestMoves).toBe(true);
    expect(second.record.bestMoves).toBe(8);
    expect(second.isNewBestTime).toBe(true);
    expect(second.record.bestTimeLeftSeconds).toBe(25);
  });
});

describe("getCompletedLevelCount / getHighestUnlockedLevelIndex", () => {
  it("counts only levels actually marked completed", () => {
    let progress = freshProgress();
    ({ progress } = recordLevelCompletion({ progress, levelId: 1, moves: 5, timeLeftSeconds: null }));
    ({ progress } = recordLevelCompletion({ progress, levelId: 3, moves: 5, timeLeftSeconds: null }));
    expect(getCompletedLevelCount(progress, LEVEL_IDS)).toBe(2);
  });

  it("resolves the unlocked index even if highestUnlockedLevelId isn't in the level list", () => {
    const progress: CampaignProgressState = { ...freshProgress(), highestUnlockedLevelId: 999 };
    // Falls back to the last level whose id is <= the stored value.
    expect(getHighestUnlockedLevelIndex(progress, LEVEL_IDS)).toBe(LEVEL_IDS.length - 1);
  });

  it("returns -1 for an empty level list", () => {
    expect(getHighestUnlockedLevelIndex(freshProgress(), [])).toBe(-1);
  });
});

describe("syncCampaignProgress", () => {
  it("clamps lastPlayedLevelId back into range if the level list changed under it", () => {
    const progress: CampaignProgressState = { ...freshProgress(), lastPlayedLevelId: 999, highestUnlockedLevelId: 3 };
    const synced = syncCampaignProgress(progress, LEVEL_IDS);
    expect(LEVEL_IDS).toContain(synced.lastPlayedLevelId);
  });

  it("is a no-op when nothing needs to change", () => {
    const progress = freshProgress();
    const synced = syncCampaignProgress(progress, LEVEL_IDS);
    expect(synced).toBe(progress); // reference equality: no new object created
  });
});

describe("getLevelCampaignRecord", () => {
  it("returns null for a level with no record yet", () => {
    expect(getLevelCampaignRecord(freshProgress(), 1)).toBeNull();
  });
});

describe("localStorage persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips through save/load", () => {
    const { progress } = recordLevelCompletion({ progress: freshProgress(), levelId: 2, moves: 9, timeLeftSeconds: 40 });
    saveCampaignProgress(progress);
    const loaded = loadCampaignProgress();
    expect(loaded.levels["2"]?.bestMoves).toBe(9);
  });

  it("falls back to defaults on corrupted storage instead of throwing", () => {
    localStorage.setItem("stone-age-campaign-progress-v1", "{not json");
    expect(() => loadCampaignProgress()).not.toThrow();
    expect(loadCampaignProgress().highestUnlockedLevelId).toBe(1);
  });
});
