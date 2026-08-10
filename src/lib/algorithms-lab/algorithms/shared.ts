import type { Position } from "@/game/types";
import type { SolveState } from "@/lib/solver/state";

export function goalKeySet(goalCaves: Position[]): Set<string> {
  return new Set(goalCaves.map((g) => `${g.x},${g.y}`));
}

export function isGoalState(state: SolveState, goalKeys: Set<string>): boolean {
  return goalKeys.has(`${state.playerPos.x},${state.playerPos.y}`);
}

export function reconstructActions(
  prev: Map<string, { p: string; a: string }>,
  startKey: string,
  goalKey: string,
): string[] {
  const actions: string[] = [];
  let cur = goalKey;
  while (cur !== startKey) {
    const link = prev.get(cur);
    if (!link) break;
    actions.push(link.a);
    cur = link.p;
  }
  actions.reverse();
  return actions;
}
