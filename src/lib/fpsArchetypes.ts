// Pure, framework-free CellType -> visual-archetype mapping for FPS mode's miniature-diorama
// renderer (src/components/GameFPS.tsx). No new game state is introduced here — elevation/shape
// is a deterministic function of the existing CellType grid, recomputed every render, exactly like
// Game3D.tsx's inline tileData bucketing (Game3D.tsx:2109-2172), just generalized and kept testable
// in isolation from React/three.
//
// Two independent concerns per cell: a "ground" archetype (the walkable surface, or lack of one)
// and zero or more "prop" archetypes (distinct objects sitting on top of that ground — a pillar, a
// key, a directional arrow indicator, ...). Most cells get a floor ground plus no prop; walls/
// water/void override the ground; stone/breakable/arrows/keys/locks/bonus-time layer a prop on top
// of a normal floor. Cave/goal (3) and start-cave (18) markers are deliberately NOT covered here —
// cave rendering needs findGoalCaves()'s cavePos-fallback semantics (src/game/caves.ts), so
// GameFPS.tsx handles those as a separate overlay pass, same as Game3D.tsx does.
//
// Arrow direction props reuse getArrowDirections() (src/game/arrows.ts) — the same function that
// drives actual glide movement — rather than re-encoding direction semantics a second time, so a
// bidirectional/omnidirectional arrow cell renders one directional indicator per direction it
// actually behaves as, sourced from the same logic that governs how it plays.

import { getArrowDirections, isArrowCell } from "@/game/arrows";

export type FpsGroundArchetype = "void" | "floor" | "wall" | "water";

export type FpsArrowPropArchetype = "arrowUp" | "arrowRight" | "arrowDown" | "arrowLeft";

export type FpsPropArchetype =
  | "stone"
  | "breakable"
  | FpsArrowPropArchetype
  | "keyRed"
  | "keyGreen"
  | "lockRed"
  | "lockGreen"
  | "bonusTime"
  | "teleport";

export const FLOOR_THICKNESS = 0.12;
export const WALL_HEIGHT = 1.6;
export const WATER_DEPTH = 0.15;

const VOID_CELL = 5;
const WALL_CELL = 1;
const WATER_CELL = 4;

const SIMPLE_PROP_ARCHETYPE_BY_CELL: Partial<Record<number, FpsPropArchetype>> = {
  2: "stone",
  6: "breakable",
  19: "teleport",
  14: "keyRed",
  15: "keyGreen",
  16: "lockRed",
  17: "lockGreen",
  20: "bonusTime",
};

export function groundArchetypeForCell(cell: number): FpsGroundArchetype {
  if (cell === VOID_CELL) return "void";
  if (cell === WALL_CELL) return "wall";
  if (cell === WATER_CELL) return "water";
  return "floor";
}

/** Non-arrow cells map to at most one prop archetype. Arrow cells are handled separately via
 * arrowPropArchetypesForCell(), since a single arrow cell can represent multiple directions. */
export function propArchetypeForCell(cell: number): FpsPropArchetype | null {
  return SIMPLE_PROP_ARCHETYPE_BY_CELL[cell] ?? null;
}

const arrowBucketForDelta = (dx: number, dy: number): FpsArrowPropArchetype => {
  if (dy === -1) return "arrowUp";
  if (dy === 1) return "arrowDown";
  return dx === 1 ? "arrowRight" : "arrowLeft";
};

/** One directional-indicator bucket per direction this arrow cell actually behaves as (1 for
 * single-direction, 2 for bidirectional, 4 for omnidirectional) — reuses getArrowDirections()
 * rather than re-deriving direction semantics. */
export function arrowPropArchetypesForCell(cell: number): FpsArrowPropArchetype[] {
  if (!isArrowCell(cell)) return [];
  return getArrowDirections(cell).map((d) => arrowBucketForDelta(d.dx, d.dy));
}

export interface FpsGridBuckets {
  ground: {
    floor: Array<[number, number, number]>;
    wall: Array<[number, number, number]>;
    water: Array<[number, number, number]>;
  };
  props: Partial<Record<FpsPropArchetype, Array<[number, number, number]>>>;
}

/** Walks the grid once, converting grid coordinates to world-space instance positions per
 * ground/prop bucket. Mirrors Game3D.tsx's `offsetX = -gridWidth/2, offsetZ = -gridHeight/2`
 * grid-to-world convention exactly, so FPS geometry lines up with every other view mode. Prop
 * positions are the tile's floor-top anchor point (y=0); each prop's own geometry applies its own
 * local height offset on top of that. */
export function bucketGridForFps(grid: number[][], offsetX: number, offsetZ: number): FpsGridBuckets {
  const buckets: FpsGridBuckets = {
    ground: { floor: [], wall: [], water: [] },
    props: {},
  };

  const pushProp = (archetype: FpsPropArchetype, pos: [number, number, number]) => {
    (buckets.props[archetype] ??= []).push(pos);
  };

  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      const ground = groundArchetypeForCell(cell);
      if (ground === "void") continue;

      const worldX = x + offsetX;
      const worldZ = y + offsetZ;

      if (ground === "wall") {
        buckets.ground.wall.push([worldX, WALL_HEIGHT / 2, worldZ]);
      } else if (ground === "water") {
        buckets.ground.water.push([worldX, -WATER_DEPTH, worldZ]);
      } else {
        buckets.ground.floor.push([worldX, -FLOOR_THICKNESS / 2, worldZ]);
      }

      const prop = propArchetypeForCell(cell);
      if (prop) pushProp(prop, [worldX, 0, worldZ]);

      for (const arrowProp of arrowPropArchetypesForCell(cell)) {
        pushProp(arrowProp, [worldX, 0, worldZ]);
      }
    }
  }

  return buckets;
}
