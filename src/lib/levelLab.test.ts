import { describe, expect, it } from "vitest";
import {
  buildLevelLabPromotionSlots,
  generateLevelLabCampaign,
  generateLevelLabCandidate,
  levelLabDifficultyForPromotedLevelId,
  scoreLevelLabCandidate,
} from "./levelLab";

describe("level lab generator", () => {
  it("generates a playable candidate shape and solve result", async () => {
    const candidate = await generateLevelLabCandidate({
      seed: 12345,
      difficulty: "medium",
      mechanics: { keys: true, arrows: true, teleports: true },
    });

    expect(candidate.grid).toHaveLength(11);
    expect(candidate.grid[0]).toHaveLength(20);
    expect(candidate.grid[candidate.playerStart.y][candidate.playerStart.x]).toBe(18);
    expect(candidate.grid[candidate.cavePos.y][candidate.cavePos.x]).toBe(3);
    expect(candidate.reason).toEqual(expect.any(String));
    expect(candidate.nodesExpanded).toBeGreaterThanOrEqual(0);
  });

  it("scores unsolved candidates as zero", () => {
    expect(scoreLevelLabCandidate("hard", { keys: true, arrows: true, teleports: true }, null, 5000)).toBe(0);
  });

  it("pins 100-slot promotion IDs to the fixed difficulty bands", () => {
    const slots = buildLevelLabPromotionSlots(100);
    expect(slots).toHaveLength(100);

    const easy = slots.filter((slot) => slot.difficulty === "easy");
    const medium = slots.filter((slot) => slot.difficulty === "medium");
    const hard = slots.filter((slot) => slot.difficulty === "hard");
    const expert = slots.filter((slot) => slot.difficulty === "expert");

    expect(easy.map((slot) => slot.levelId)).toEqual(Array.from({ length: 25 }, (_, i) => 101 + i));
    expect(medium.map((slot) => slot.levelId)).toEqual(Array.from({ length: 25 }, (_, i) => 126 + i));
    expect(hard.map((slot) => slot.levelId)).toEqual(Array.from({ length: 25 }, (_, i) => 151 + i));
    expect(expert.map((slot) => slot.levelId)).toEqual(Array.from({ length: 25 }, (_, i) => 176 + i));

    expect(levelLabDifficultyForPromotedLevelId(101)).toBe("easy");
    expect(levelLabDifficultyForPromotedLevelId(125)).toBe("easy");
    expect(levelLabDifficultyForPromotedLevelId(126)).toBe("medium");
    expect(levelLabDifficultyForPromotedLevelId(150)).toBe("medium");
    expect(levelLabDifficultyForPromotedLevelId(151)).toBe("hard");
    expect(levelLabDifficultyForPromotedLevelId(175)).toBe("hard");
    expect(levelLabDifficultyForPromotedLevelId(176)).toBe("expert");
    expect(levelLabDifficultyForPromotedLevelId(200)).toBe("expert");
  });

  it("selects solved campaign candidates for promoted level slots", async () => {
    const result = await generateLevelLabCampaign({
      seed: 98765,
      candidateCount: 24,
      levelsToPromote: 8,
    });

    expect(result.attempted).toBe(24);
    expect(result.promoted.length).toBeGreaterThan(0);
    expect(result.promoted.every((candidate) => candidate.solved)).toBe(true);
    expect(result.promoted[0]?.promotedLevelId).toBe(101);
  });
});
