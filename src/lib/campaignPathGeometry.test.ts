import { describe, expect, it } from "vitest";
import {
  DOTS_PER_ROW,
  buildCampaignPathD,
  buildCampaignPathPoints,
  contentHeightForCount,
  xFractionForCol,
} from "./campaignPathGeometry";

describe("xFractionForCol", () => {
  it("snakes: even rows go left-to-right, odd rows go right-to-left", () => {
    const evenRowStart = xFractionForCol(0, 0);
    const evenRowEnd = xFractionForCol(DOTS_PER_ROW - 1, 0);
    const oddRowStart = xFractionForCol(0, 1);
    const oddRowEnd = xFractionForCol(DOTS_PER_ROW - 1, 1);

    expect(evenRowStart).toBeLessThan(evenRowEnd);
    expect(oddRowStart).toBeGreaterThan(oddRowEnd);
    // The two rows should be mirror images of each other.
    expect(evenRowStart).toBeCloseTo(oddRowEnd, 5);
    expect(evenRowEnd).toBeCloseTo(oddRowStart, 5);
  });

  it("never reaches the container edges (0 or 1)", () => {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < DOTS_PER_ROW; col++) {
        const frac = xFractionForCol(col, row);
        expect(frac).toBeGreaterThan(0);
        expect(frac).toBeLessThan(1);
      }
    }
  });
});

describe("buildCampaignPathPoints", () => {
  it("assigns sequential rows based on DOTS_PER_ROW", () => {
    const items = Array.from({ length: DOTS_PER_ROW * 2 + 1 }, (_, i) => i);
    const points = buildCampaignPathPoints(items);
    expect(points[0].row).toBe(0);
    expect(points[DOTS_PER_ROW].row).toBe(1);
    expect(points[DOTS_PER_ROW * 2].row).toBe(2);
  });

  it("preserves the original item order and identity", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const points = buildCampaignPathPoints(items);
    expect(points.map((p) => p.item)).toEqual(items);
  });

  it("increases y monotonically with row", () => {
    const items = Array.from({ length: DOTS_PER_ROW * 3 }, (_, i) => i);
    const points = buildCampaignPathPoints(items);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].y).toBeGreaterThanOrEqual(points[i - 1].y);
    }
  });
});

describe("buildCampaignPathD", () => {
  it("returns an empty string for no points", () => {
    expect(buildCampaignPathD([])).toBe("");
  });

  it("starts with M and continues with L for each subsequent point", () => {
    const d = buildCampaignPathD([{ xFrac: 0.1, y: 0 }, { xFrac: 0.9, y: 100 }, { xFrac: 0.5, y: 200 }]);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.match(/L /g)).toHaveLength(2);
  });
});

describe("contentHeightForCount", () => {
  it("grows with the number of items", () => {
    expect(contentHeightForCount(DOTS_PER_ROW)).toBeLessThan(contentHeightForCount(DOTS_PER_ROW * 5));
  });

  it("never returns a non-positive height, even for zero items", () => {
    expect(contentHeightForCount(0)).toBeGreaterThan(0);
  });
});
