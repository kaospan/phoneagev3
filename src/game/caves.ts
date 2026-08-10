import type { Position } from "./types";

export const GOAL_CAVE_TILE = 3 as const;

export const findGoalCaves = (
  grid: number[][] | undefined,
  fallback?: Position | null,
): Position[] => {
  const caves: Position[] = [];

  if (grid) {
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < (grid[y]?.length ?? 0); x += 1) {
        if (grid[y][x] === GOAL_CAVE_TILE) caves.push({ x, y });
      }
    }
  }

  if (caves.length > 0) return caves;
  if (fallback) return [{ ...fallback }];
  return [];
};

export const buildGoalCaveKeySet = (
  grid: number[][] | undefined,
  fallback?: Position | null,
): Set<string> => {
  const keys = new Set<string>();
  for (const cave of findGoalCaves(grid, fallback)) {
    keys.add(`${cave.x},${cave.y}`);
  }
  return keys;
};
