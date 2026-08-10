import type { CellType, KeyInventory, Position } from "@/game/types";
import { isArrowCell } from "@/game/arrows";
import { TELEPORT_CELL } from "@/game/teleport";
import type { SolveState } from "./state";

export function cloneGrid(grid: CellType[][]): CellType[][] {
  return grid.map((r) => r.slice()) as CellType[][];
}

export function cloneInventory(inv: KeyInventory): KeyInventory {
  return {
    red: Math.max(0, Math.floor(Number(inv.red) || 0)),
    green: Math.max(0, Math.floor(Number(inv.green) || 0)),
  };
}

export function cloneBreakables(map: Map<string, boolean>): Map<string, boolean> {
  return new Map(map);
}

export function buildBaseGrid(levelGrid: CellType[][]): CellType[][] {
  return levelGrid.map((row, y) =>
    row.map((cell, x) => {
      if (isArrowCell(cell)) {
        const adjacentCells: CellType[] = [];
        if (y > 0) adjacentCells.push(levelGrid[y - 1][x] as CellType);
        if (y < levelGrid.length - 1) adjacentCells.push(levelGrid[y + 1][x] as CellType);
        if (x > 0) adjacentCells.push(levelGrid[y][x - 1] as CellType);
        if (x < row.length - 1) adjacentCells.push(levelGrid[y][x + 1] as CellType);

        const terrainTypes = adjacentCells
          .filter(
            (c) =>
              !isArrowCell(c) && c !== 2 && c !== 6 && c !== 18 && c !== TELEPORT_CELL && c !== 20
          );
        if (terrainTypes.length > 0) {
          const counts = new Map<number, number>();
          for (const t of terrainTypes) counts.set(t, (counts.get(t) ?? 0) + 1);
          let best: number = 5;
          let bestCount = -1;
          for (const [t, c] of counts.entries()) {
            if (c > bestCount) {
              bestCount = c;
              best = t;
            }
          }
          return best as CellType;
        }
        return 5;
      }
      return cell;
    })
  ) as CellType[][];
}
