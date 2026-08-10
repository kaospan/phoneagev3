import { describe, expect, it } from "vitest";
import {
  arrowPropArchetypesForCell,
  bucketGridForFps,
  FLOOR_THICKNESS,
  groundArchetypeForCell,
  propArchetypeForCell,
  WALL_HEIGHT,
  WATER_DEPTH,
} from "./fpsArchetypes";

describe("groundArchetypeForCell", () => {
  it("maps void (5) to void", () => {
    expect(groundArchetypeForCell(5)).toBe("void");
  });

  it("maps wall (1) to wall", () => {
    expect(groundArchetypeForCell(1)).toBe("wall");
  });

  it("maps water (4) to water", () => {
    expect(groundArchetypeForCell(4)).toBe("water");
  });

  it("maps every other known cell type to a walkable floor", () => {
    for (const cell of [0, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
      expect(groundArchetypeForCell(cell)).toBe("floor");
    }
  });
});

describe("propArchetypeForCell", () => {
  it("maps stone, breakable, keys, locks, bonus time, and teleport to distinct props", () => {
    expect(propArchetypeForCell(2)).toBe("stone");
    expect(propArchetypeForCell(6)).toBe("breakable");
    expect(propArchetypeForCell(14)).toBe("keyRed");
    expect(propArchetypeForCell(15)).toBe("keyGreen");
    expect(propArchetypeForCell(16)).toBe("lockRed");
    expect(propArchetypeForCell(17)).toBe("lockGreen");
    expect(propArchetypeForCell(20)).toBe("bonusTime");
    expect(propArchetypeForCell(19)).toBe("teleport");
  });

  it("returns null for arrow cells (handled separately) and cells with no prop", () => {
    for (const cell of [0, 1, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 18]) {
      expect(propArchetypeForCell(cell)).toBeNull();
    }
  });
});

describe("arrowPropArchetypesForCell", () => {
  it("returns exactly one direction for single-direction arrows (7-10)", () => {
    expect(arrowPropArchetypesForCell(7)).toEqual(["arrowUp"]);
    expect(arrowPropArchetypesForCell(8)).toEqual(["arrowRight"]);
    expect(arrowPropArchetypesForCell(9)).toEqual(["arrowDown"]);
    expect(arrowPropArchetypesForCell(10)).toEqual(["arrowLeft"]);
  });

  it("returns two directions for bidirectional arrows (11/12), agreeing with getArrowDirections", () => {
    expect(arrowPropArchetypesForCell(11)).toEqual(["arrowUp", "arrowDown"]);
    expect(arrowPropArchetypesForCell(12)).toEqual(["arrowLeft", "arrowRight"]);
  });

  it("returns all four directions for the omnidirectional arrow (13)", () => {
    expect(arrowPropArchetypesForCell(13)).toEqual(
      expect.arrayContaining(["arrowUp", "arrowRight", "arrowDown", "arrowLeft"])
    );
    expect(arrowPropArchetypesForCell(13)).toHaveLength(4);
  });

  it("returns an empty array for non-arrow cells", () => {
    expect(arrowPropArchetypesForCell(0)).toEqual([]);
    expect(arrowPropArchetypesForCell(14)).toEqual([]);
  });
});

describe("bucketGridForFps", () => {
  it("skips void cells entirely and buckets ground by world position", () => {
    const grid = [
      [1, 1, 1],
      [1, 0, 5],
    ];
    const { ground } = bucketGridForFps(grid, -1, -1);

    // Row 0 is all walls; row 1 is [wall, floor, void] — the void cell is skipped entirely.
    expect(ground.wall).toHaveLength(4);
    expect(ground.wall).toContainEqual([-1, WALL_HEIGHT / 2, -1]);
    expect(ground.wall).toContainEqual([-1, WALL_HEIGHT / 2, 0]);
    expect(ground.floor).toHaveLength(1);
    expect(ground.floor).toContainEqual([0, -FLOOR_THICKNESS / 2, 0]);
  });

  it("buckets water separately from floor, sunken below floor height", () => {
    const { ground } = bucketGridForFps([[4]], 0, 0);
    expect(ground.water).toEqual([[0, -WATER_DEPTH, 0]]);
    expect(ground.floor).toEqual([]);
  });

  it("gives cells with a simple prop archetype both a floor ground entry and a prop entry", () => {
    const { ground, props } = bucketGridForFps([[14]], 0, 0);
    expect(ground.floor).toEqual([[0, -FLOOR_THICKNESS / 2, 0]]);
    expect(props.keyRed).toEqual([[0, 0, 0]]);
  });

  it("pushes an omnidirectional arrow cell's position into all four arrow buckets", () => {
    const { props } = bucketGridForFps([[13]], 0, 0);
    expect(props.arrowUp).toEqual([[0, 0, 0]]);
    expect(props.arrowRight).toEqual([[0, 0, 0]]);
    expect(props.arrowDown).toEqual([[0, 0, 0]]);
    expect(props.arrowLeft).toEqual([[0, 0, 0]]);
  });

  it("returns empty buckets for an all-void grid", () => {
    const { ground, props } = bucketGridForFps([[5, 5], [5, 5]], 0, 0);
    expect(ground.floor).toEqual([]);
    expect(ground.wall).toEqual([]);
    expect(ground.water).toEqual([]);
    expect(props).toEqual({});
  });
});
