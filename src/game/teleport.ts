import type { CellType, Position } from "./types";

export const TELEPORT_CELL: CellType = 19;

/**
 * Returns the next teleport pad in the level's cycle after the one at `at`.
 *
 * Teleports are not fixed pairs — stepping on any teleport pad advances to the
 * *next* pad in reading order (row-major), wrapping back to the first after the
 * last: 0 -> 1 -> 2 -> ... -> n-1 -> 0 -> ...
 *
 * If there are fewer than 2 teleports, or `at` isn't a teleport, returns null.
 */
export function getNextTeleport(grid: CellType[][], at: Position): Position | null {
  if (!grid?.length || !grid[0]?.length) return null;
  if (grid[at.y]?.[at.x] !== TELEPORT_CELL) return null;

  const teleports: Position[] = [];
  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === TELEPORT_CELL) teleports.push({ x, y });
    }
  }

  if (teleports.length < 2) return null;

  const idx = teleports.findIndex((t) => t.x === at.x && t.y === at.y);
  if (idx < 0) return null;

  return teleports[(idx + 1) % teleports.length];
}
