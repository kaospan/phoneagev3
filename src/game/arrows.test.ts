import { describe, expect, it } from "vitest";
import { getArrowDirections, isArrowCell } from "./arrows";

describe("isArrowCell", () => {
  it("recognizes single-direction arrows (7-10)", () => {
    expect(isArrowCell(7)).toBe(true);
    expect(isArrowCell(8)).toBe(true);
    expect(isArrowCell(9)).toBe(true);
    expect(isArrowCell(10)).toBe(true);
  });

  it("recognizes multi-direction arrows (11-13)", () => {
    expect(isArrowCell(11)).toBe(true);
    expect(isArrowCell(12)).toBe(true);
    expect(isArrowCell(13)).toBe(true);
  });

  it("rejects non-arrow cell types", () => {
    for (const cell of [0, 1, 2, 3, 4, 5, 6, 14, 15, 16, 17, 18, 19, 20]) {
      expect(isArrowCell(cell)).toBe(false);
    }
  });
});

describe("getArrowDirections", () => {
  it("returns a single vector for single-direction arrows", () => {
    expect(getArrowDirections(7)).toEqual([{ dx: 0, dy: -1 }]); // up
    expect(getArrowDirections(8)).toEqual([{ dx: 1, dy: 0 }]); // right
    expect(getArrowDirections(9)).toEqual([{ dx: 0, dy: 1 }]); // down
    expect(getArrowDirections(10)).toEqual([{ dx: -1, dy: 0 }]); // left
  });

  it("returns two vectors for dual-direction arrows", () => {
    expect(getArrowDirections(11)).toEqual([{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }]);
    expect(getArrowDirections(12)).toEqual([{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }]);
  });

  it("returns all four vectors for the omni arrow", () => {
    expect(getArrowDirections(13)).toHaveLength(4);
    expect(getArrowDirections(13)).toEqual(
      expect.arrayContaining([
        { dx: 0, dy: -1 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
      ]),
    );
  });

  it("returns an empty array for non-arrow cells", () => {
    expect(getArrowDirections(0)).toEqual([]);
    expect(getArrowDirections(5)).toEqual([]);
  });
});
