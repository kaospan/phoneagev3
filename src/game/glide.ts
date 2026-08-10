import { CellType, Position, PlayerGlideResult, ArrowMoveResult } from './types';
import { isArrowCell } from './arrows';

// Cells blocking glide (stop before entering)
const PLAYER_GLIDE_BLOCKERS = new Set<CellType>([0, 1, 2, 3, 6, 18, 19, 20]); // floor, fire/wall, stone, cave (goal), breakable rock, start-marker cave, teleport, bonus time
const REMOTE_GLIDE_BLOCKERS = new Set<CellType>([0, 1, 2, 3, 6, 18, 19, 20]); // remote: floor stops, fire/wall, stone, cave, breakable rock, start-marker cave, teleport, bonus time, arrows handled separately

// Cells over which player-carried arrow may glide
const PLAYER_GLIDABLE = new Set<CellType>([4,5]); // water, void
// Remote arrow glides over water/void only (fire/wall behaves like stone)
const REMOTE_GLIDABLE = new Set<CellType>([4,5]);

export function computePlayerGlidePath(grid: CellType[][], start: Position, dx: number, dy: number, arrowType: CellType): PlayerGlideResult {
  const path: Position[] = [];
  let x = start.x;
  let y = start.y;
  while (true) {
    const nx = x + dx;
    const ny = y + dy;
    if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[0].length) break; // bounds
    const cell = grid[ny][nx];
    if (PLAYER_GLIDE_BLOCKERS.has(cell)) break; // stop before blocker
    if (isArrowCell(cell)) break; // stop before another arrow
    if (PLAYER_GLIDABLE.has(cell)) {
      x = nx; y = ny;
      path.push({ x, y });
      continue;
    }
    break; // unknown cell type -> stop
  }
  return { path, arrowType };
}

export function computeRemoteArrowGlidePath(grid: CellType[][], start: Position, dx: number, dy: number, arrowType: CellType): ArrowMoveResult {
  const path: Position[] = [];
  let x = start.x;
  let y = start.y;
  while (true) {
    const nx = x + dx;
    const ny = y + dy;
    if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[0].length) break;
    const cell = grid[ny][nx];
    if (REMOTE_GLIDE_BLOCKERS.has(cell) || isArrowCell(cell)) break;
    if (REMOTE_GLIDABLE.has(cell)) {
      x = nx; y = ny;
      path.push({ x, y });
      continue;
    }
    break;
  }
  return { path, arrowType };
}
