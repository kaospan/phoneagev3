import { describe, expect, it } from "vitest";
import { isPlaceholderGrid } from "@/data/levels";
import { DIFFICULTY_TIERS, getLabLevel, getLabLevels } from "./levelCatalog";

describe("getLabLevels", () => {
  it("excludes placeholder/stub grids", () => {
    const levels = getLabLevels();
    expect(levels.length).toBeGreaterThan(0);
    for (const level of levels) {
      expect(isPlaceholderGrid(level.grid)).toBe(false);
    }
  });

  it("spreads real levels across more than one difficulty tier, using only known tiers", () => {
    const levels = getLabLevels();
    const tiersUsed = new Set(levels.map((l) => l.tier));
    expect(tiersUsed.size).toBeGreaterThan(1);
    for (const level of levels) {
      expect(DIFFICULTY_TIERS).toContain(level.tier);
    }
  });

  it("always includes level 8, hardcoded as the highlighted BFS-explosion example", () => {
    const level8 = getLabLevel(8);
    expect(level8).toBeDefined();
    expect(level8?.highlighted).toBe("bfs-explosion");
  });

  it("is memoized across calls", () => {
    expect(getLabLevels()).toBe(getLabLevels());
  });
});
