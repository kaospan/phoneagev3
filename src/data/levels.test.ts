import { describe, expect, it } from "vitest";
import { getAllLevels, isPlaceholderGrid } from "./levels";

describe("getAllLevels data integrity", () => {
  const levels = getAllLevels();
  const coreLevels = levels.filter((l) => l.id >= 1 && l.id <= 200);

  it("has all 200 core campaign levels, no gaps", () => {
    const ids = coreLevels.map((l) => l.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
  });

  it("has no duplicate level ids anywhere in the full set (including variations)", () => {
    const ids = levels.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no two core levels sharing an identical grid (regression guard for the level-101-200 duplicate bug)", () => {
    const seen = new Map<string, number>();
    const dupes: Array<{ id: number; matches: number }> = [];
    for (const level of coreLevels) {
      if (isPlaceholderGrid(level.grid)) continue;
      const key = JSON.stringify(level.grid);
      const existing = seen.get(key);
      if (existing != null) dupes.push({ id: level.id, matches: existing });
      else seen.set(key, level.id);
    }
    expect(dupes).toEqual([]);
  });

  it("every non-placeholder level has exactly one player start and one cave/goal cell it points at", () => {
    for (const level of coreLevels) {
      if (isPlaceholderGrid(level.grid)) continue;
      expect(level.playerStart.x).toBeGreaterThanOrEqual(0);
      expect(level.playerStart.y).toBeGreaterThanOrEqual(0);
      expect(level.cavePos.x).toBeGreaterThanOrEqual(0);
      expect(level.cavePos.y).toBeGreaterThanOrEqual(0);
      expect(level.playerStart).not.toEqual(level.cavePos);
    }
  });

  it("every non-placeholder level's playerStart/cavePos fall inside the grid bounds", () => {
    for (const level of coreLevels) {
      if (isPlaceholderGrid(level.grid)) continue;
      const rows = level.grid.length;
      const cols = level.grid[0]?.length ?? 0;
      expect(level.playerStart.x).toBeLessThan(cols);
      expect(level.playerStart.y).toBeLessThan(rows);
      expect(level.cavePos.x).toBeLessThan(cols);
      expect(level.cavePos.y).toBeLessThan(rows);
    }
  });

  it("every grid row has the same length as the first row (no ragged grids)", () => {
    for (const level of coreLevels) {
      const width = level.grid[0]?.length ?? 0;
      for (const row of level.grid) {
        expect(row.length).toBe(width);
      }
    }
  });

  it("every cell value is a recognized tile type (0-20)", () => {
    for (const level of coreLevels) {
      for (const row of level.grid) {
        for (const cell of row) {
          expect(cell).toBeGreaterThanOrEqual(0);
          expect(cell).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  it("timeLimitSeconds, when set, is a positive number (regression guard for the null-timer bug on 101-200)", () => {
    for (const level of coreLevels) {
      if (level.timeLimitSeconds == null) continue;
      expect(level.timeLimitSeconds).toBeGreaterThan(0);
    }
  });
});
