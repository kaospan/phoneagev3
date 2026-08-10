import type { CellType, Position } from "@/game/types";
import { TELEPORT_CELL } from "@/game/teleport";

export function manhattanToGoal(pos: Position, goals: Position[]): number {
  let best = Infinity;
  for (const g of goals) {
    const d = Math.abs(pos.x - g.x) + Math.abs(pos.y - g.y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Builds an A* heuristic that also accounts for teleport-pad shortcuts.
 *
 * Plain Manhattan distance can badly OVERESTIMATE the true remaining cost near a teleport
 * pad: a single teleport action (cost 1) can move the player far more than 1 Manhattan unit,
 * so a position that's "far" from the goal by raw distance can really be a couple of moves
 * away via a pad. An overestimating heuristic misguides A* — it deprioritizes states that are
 * actually close to solved because they don't *look* close, forcing the search to explore
 * huge numbers of alternative branches that "look" more promising but aren't (this is what
 * was causing teleport-heavy levels to expand 40k-125k+ nodes before timing out).
 *
 * Fix: precompute, once per level, the best distance-to-goal reachable by riding zero or more
 * hops of the (deterministic, cyclic) pad sequence starting from each pad. A state's heuristic
 * is then the smaller of "walk straight to the goal" and "walk to some pad, then ride it from
 * there" — still a valid lower bound (each candidate is itself an admissible estimate of one
 * legitimate strategy, and the true cost is the min over all strategies), just tighter.
 */
export function buildHeuristic(grid: CellType[][], goals: Position[]): (pos: Position) => number {
  const pads: Position[] = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      if (row[x] === TELEPORT_CELL) pads.push({ x, y });
    }
  }
  if (pads.length < 2) {
    return (pos) => manhattanToGoal(pos, goals);
  }

  const n = pads.length;
  // Best distance-to-goal achievable starting at pad i, having the option to ride 0..n-1
  // further hops around the cycle before walking the rest of the way.
  const padGoalDist = pads.map((_, i) => {
    let best = Infinity;
    for (let hops = 0; hops < n; hops++) {
      const pad = pads[(i + hops) % n];
      const d = hops + manhattanToGoal(pad, goals);
      if (d < best) best = d;
    }
    return best;
  });

  return (pos) => {
    let best = manhattanToGoal(pos, goals);
    for (let i = 0; i < n; i++) {
      const viaPad = manhattanToGoal(pos, [pads[i]]) + padGoalDist[i];
      if (viaPad < best) best = viaPad;
    }
    return best;
  };
}
