import { describe, expect, it } from "vitest";
import { computePlayerGlidePath, computeRemoteArrowGlidePath } from "./glide";
import type { CellType } from "./types";

// Legend used throughout: 0 floor, 1 wall, 2 stone, 3 cave, 4 water, 5 void, 6 breakable,
// 7-10 single arrows, 18 start marker, 19 teleport, 20 bonus.
const row = (...cells: CellType[]) => cells;

describe("computePlayerGlidePath", () => {
  it("glides across void until hitting a blocker, stopping in the last glidable cell", () => {
    const grid = [row(8, 5, 5, 5, 0)]; // arrow, void, void, void, floor(blocker)
    const result = computePlayerGlidePath(grid, { x: 0, y: 0 }, 1, 0, 8);
    expect(result.path).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
    expect(result.arrowType).toBe(8);
  });

  it("glides over water the same as void", () => {
    const grid = [row(8, 4, 4, 2)];
    const result = computePlayerGlidePath(grid, { x: 0, y: 0 }, 1, 0, 8);
    expect(result.path).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it("produces an empty path when immediately blocked", () => {
    const grid = [row(8, 0)];
    const result = computePlayerGlidePath(grid, { x: 0, y: 0 }, 1, 0, 8);
    expect(result.path).toEqual([]);
  });

  it("stops before another arrow tile rather than passing through it", () => {
    const grid = [row(8, 5, 9, 5)];
    const result = computePlayerGlidePath(grid, { x: 0, y: 0 }, 1, 0, 8);
    expect(result.path).toEqual([{ x: 1, y: 0 }]);
  });

  it("stops at the grid boundary", () => {
    const grid = [row(8, 5, 5)];
    const result = computePlayerGlidePath(grid, { x: 0, y: 0 }, 1, 0, 8);
    expect(result.path).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it("never lands directly on a blocker cell", () => {
    const grid = [row(8, 5, 5, 1)]; // wall blocker at the end
    const result = computePlayerGlidePath(grid, { x: 0, y: 0 }, 1, 0, 8);
    const last = result.path[result.path.length - 1];
    expect(grid[last.y][last.x]).not.toBe(1);
  });
});

describe("computeRemoteArrowGlidePath", () => {
  it("mirrors player glide behavior over void/water", () => {
    const grid = [row(13, 5, 5, 0)];
    const result = computeRemoteArrowGlidePath(grid, { x: 0, y: 0 }, 1, 0, 13);
    expect(result.path).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it("stops before hitting another arrow", () => {
    const grid = [row(13, 5, 7, 5)];
    const result = computeRemoteArrowGlidePath(grid, { x: 0, y: 0 }, 1, 0, 13);
    expect(result.path).toEqual([{ x: 1, y: 0 }]);
  });

  it("stops before a breakable rock", () => {
    const grid = [row(13, 5, 6)];
    const result = computeRemoteArrowGlidePath(grid, { x: 0, y: 0 }, 1, 0, 13);
    expect(result.path).toEqual([{ x: 1, y: 0 }]);
  });
});
