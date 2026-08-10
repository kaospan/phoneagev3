import { astar } from "./algorithms/astar";
import { beamSearch } from "./algorithms/beamSearch";
import { bfs } from "./algorithms/bfs";
import { dfs } from "./algorithms/dfs";
import { dijkstra } from "./algorithms/dijkstra";
import { greedyBestFirst } from "./algorithms/greedyBestFirst";
import { hillClimbing } from "./algorithms/hillClimbing";
import { iddfs } from "./algorithms/iddfs";
import { simulatedAnnealing } from "./algorithms/simulatedAnnealing";
import { weightedAstar } from "./algorithms/weightedAstar";
import type { AlgorithmDescriptor, AlgorithmId } from "./types";

// Ordered so each original algorithm (row 1, in AlgorithmPicker's 4-column grid) sits directly
// above its closest relative (row 2): BFS/Dijkstra, DFS/IDDFS, Greedy/Beam Search, A*/Weighted A*.
// Row 3 is a third family — local search with no frontier at all — introduced as a pair:
// Hill Climbing (deterministic, gets stuck) and Simulated Annealing (randomized, can escape).
export const ALGORITHMS: AlgorithmDescriptor[] = [
  bfs,
  dfs,
  greedyBestFirst,
  astar,
  dijkstra,
  iddfs,
  beamSearch,
  weightedAstar,
  hillClimbing,
  simulatedAnnealing,
];

export function getAlgorithm(id: AlgorithmId): AlgorithmDescriptor {
  const found = ALGORITHMS.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown algorithm id: ${id}`);
  return found;
}
